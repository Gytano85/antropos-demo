import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const supplierInput = z.object({
	name: z.string().trim().min(1).max(255),
	contactName: z.string().trim().max(255).optional(),
	email: z.string().trim().email().optional().or(z.literal("")),
	// Formato libre en la UI, pero se recomienda E.164 (+52...) para que el SMS funcione.
	phone: z.string().trim().max(20).optional().or(z.literal("")),
	notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const suppliersRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return db.query.suppliers.findMany({
			where: eq(suppliers.user_uid, ctx.user.id),
			orderBy: (table, { asc }) => [asc(table.name)],
		});
	}),

	create: protectedProcedure
		.input(supplierInput)
		.mutation(async ({ ctx, input }) => {
			const [created] = await db
				.insert(suppliers)
				.values({
					user_uid: ctx.user.id,
					name: input.name,
					contact_name: input.contactName || null,
					email: input.email || null,
					phone: input.phone || null,
					notes: input.notes || null,
				})
				.returning();
			return created;
		}),

	update: protectedProcedure
		.input(supplierInput.extend({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(suppliers)
				.set({
					name: input.name,
					contact_name: input.contactName || null,
					email: input.email || null,
					phone: input.phone || null,
					notes: input.notes || null,
					updated_at: new Date(),
				})
				.where(
					and(eq(suppliers.id, input.id), eq(suppliers.user_uid, ctx.user.id)),
				)
				.returning();
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });
			}
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(suppliers)
				.where(
					and(eq(suppliers.id, input.id), eq(suppliers.user_uid, ctx.user.id)),
				);
			return { success: true };
		}),
});
