import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	BRANCH_PERMISSIONS,
	BRANCH_ROLES,
	DEFAULT_ROLE_PERMISSIONS,
	permissionsForRole,
} from "@/lib/branches/permissions";
import { db } from "@/lib/db";
import {
	branches,
	branchMemberships,
	branchRolePermissions,
	orders,
	products,
	user,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

function accountUserId(ctxUser: { id: string; accountUserId?: string }) {
	return ctxUser.accountUserId ?? ctxUser.id;
}

async function requireBranchManager(userId: string, branchId: number) {
	const membership = await db.query.branchMemberships.findFirst({
		where: and(
			eq(branchMemberships.user_uid, userId),
			eq(branchMemberships.branch_id, branchId),
			eq(branchMemberships.status, "active"),
		),
	});
	if (!membership || !["owner", "admin"].includes(membership.role)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "No tienes permiso para administrar esta sucursal.",
		});
	}
	return membership;
}

export const branchesRouter = router({
	listMine: protectedProcedure.query(async ({ ctx }) => {
		const userId = accountUserId(ctx.user);
		const memberships = await db.query.branchMemberships.findMany({
			where: and(
				eq(branchMemberships.user_uid, userId),
				eq(branchMemberships.status, "active"),
			),
			with: { branch: { with: { organization: true } } },
			orderBy: [desc(branchMemberships.created_at)],
		});
		return Promise.all(
			memberships.map(async (membership) => {
				const [productCount, openOrderCount] = await Promise.all([
					db
						.select({ count: sql<number>`count(*)` })
						.from(products)
						.where(eq(products.user_uid, membership.branch.data_scope_uid)),
					db
						.select({ count: sql<number>`count(*)` })
						.from(orders)
						.where(
							and(
								eq(orders.user_uid, membership.branch.data_scope_uid),
								eq(orders.status, "open"),
							),
						),
				]);
				return {
					...membership.branch,
					organizationName: membership.branch.organization.name,
					role: membership.role,
					isActive: ctx.user.branchId === membership.branch.id,
					productCount: Number(productCount[0]?.count ?? 0),
					openOrderCount: Number(openOrderCount[0]?.count ?? 0),
				};
			}),
		);
	}),

	active: protectedProcedure.query(({ ctx }) => ({
		id: ctx.user.branchId ?? null,
		name: ctx.user.branchName ?? null,
		role: ctx.user.role ?? null,
		permissions: ctx.user.permissions ?? [],
		// Identidad de quien entró, para el menú de cuenta. `ctx.user.id` es el
		// scope de la sucursal activa, no la persona, asi que no sirve aqui.
		accountName: ctx.user.name ?? null,
		accountEmail: ctx.user.email ?? null,
	})),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().trim().min(2).max(160),
				code: z.string().trim().min(2).max(30),
				address: z.string().trim().max(500).optional(),
				phone: z.string().trim().max(30).optional(),
				timezone: z
					.string()
					.trim()
					.min(3)
					.max(80)
					.default("America/Mexico_City"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = accountUserId(ctx.user);
			const anchor = await db.query.branchMemberships.findFirst({
				where: and(
					eq(branchMemberships.user_uid, userId),
					inArray(branchMemberships.role, ["owner", "admin"]),
				),
				with: { branch: true },
			});
			if (!anchor) throw new TRPCError({ code: "FORBIDDEN" });
			const [branch] = await db
				.insert(branches)
				.values({
					organization_id: anchor.branch.organization_id,
					name: input.name,
					code: input.code.toUpperCase().replace(/\s+/g, "-"),
					address: input.address || null,
					phone: input.phone || null,
					timezone: input.timezone,
					data_scope_uid: `branch:${anchor.branch.organization_id}:${crypto.randomUUID()}`,
				})
				.returning();
			await db
				.insert(branchMemberships)
				.values({ branch_id: branch.id, user_uid: userId, role: "owner" });
			return branch;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number().int().positive(),
				name: z.string().trim().min(2).max(160),
				code: z.string().trim().min(2).max(30),
				address: z.string().trim().max(500).nullable().optional(),
				phone: z.string().trim().max(30).nullable().optional(),
				status: z.enum(["active", "inactive"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.id);
			const { id, ...data } = input;
			return (
				await db
					.update(branches)
					.set({
						...data,
						code: data.code.toUpperCase(),
						updated_at: new Date(),
					})
					.where(eq(branches.id, id))
					.returning()
			)[0];
		}),

	members: protectedProcedure
		.input(z.object({ branchId: z.number().int().positive() }))
		.query(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			return db
				.select({
					id: branchMemberships.id,
					userId: branchMemberships.user_uid,
					name: user.name,
					email: user.email,
					role: branchMemberships.role,
					status: branchMemberships.status,
				})
				.from(branchMemberships)
				.innerJoin(user, eq(user.id, branchMemberships.user_uid))
				.where(eq(branchMemberships.branch_id, input.branchId));
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				branchId: z.number().int().positive(),
				email: z.string().trim().email(),
				role: z.enum(BRANCH_ROLES).exclude(["owner"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			const target = await db.query.user.findFirst({
				where: eq(user.email, input.email.toLowerCase()),
			});
			if (!target)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ese correo todavía no tiene una cuenta en el sistema.",
				});
			return (
				await db
					.insert(branchMemberships)
					.values({
						branch_id: input.branchId,
						user_uid: target.id,
						role: input.role,
					})
					.onConflictDoUpdate({
						target: [branchMemberships.branch_id, branchMemberships.user_uid],
						set: { role: input.role, status: "active", updated_at: new Date() },
					})
					.returning()
			)[0];
		}),

	updateMember: protectedProcedure
		.input(
			z.object({
				branchId: z.number().int().positive(),
				membershipId: z.number().int().positive(),
				role: z.enum(BRANCH_ROLES).exclude(["owner"]),
				status: z.enum(["active", "inactive"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			return db
				.update(branchMemberships)
				.set({ role: input.role, status: input.status, updated_at: new Date() })
				.where(
					and(
						eq(branchMemberships.id, input.membershipId),
						eq(branchMemberships.branch_id, input.branchId),
					),
				)
				.returning();
		}),

	roleMatrix: protectedProcedure
		.input(z.object({ branchId: z.number().int().positive() }))
		.query(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			const overrides = await db
				.select()
				.from(branchRolePermissions)
				.where(eq(branchRolePermissions.branch_id, input.branchId));
			const byRole = new Map(
				overrides.map((row) => [row.role, row.permissions]),
			);
			return BRANCH_ROLES.map((role) => ({
				role,
				permissions: permissionsForRole(role, byRole.get(role)),
				isDefault: !byRole.has(role),
			}));
		}),

	updateRole: protectedProcedure
		.input(
			z.object({
				branchId: z.number().int().positive(),
				role: z.enum(BRANCH_ROLES).exclude(["owner"]),
				permissions: z.array(z.enum(BRANCH_PERMISSIONS)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			return (
				await db
					.insert(branchRolePermissions)
					.values({
						branch_id: input.branchId,
						role: input.role,
						permissions: JSON.stringify(input.permissions),
					})
					.onConflictDoUpdate({
						target: [
							branchRolePermissions.branch_id,
							branchRolePermissions.role,
						],
						set: {
							permissions: JSON.stringify(input.permissions),
							updated_at: new Date(),
						},
					})
					.returning()
			)[0];
		}),

	resetRole: protectedProcedure
		.input(
			z.object({
				branchId: z.number().int().positive(),
				role: z.enum(BRANCH_ROLES).exclude(["owner"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireBranchManager(accountUserId(ctx.user), input.branchId);
			await db
				.delete(branchRolePermissions)
				.where(
					and(
						eq(branchRolePermissions.branch_id, input.branchId),
						eq(branchRolePermissions.role, input.role),
					),
				);
			return DEFAULT_ROLE_PERMISSIONS[input.role];
		}),
});
