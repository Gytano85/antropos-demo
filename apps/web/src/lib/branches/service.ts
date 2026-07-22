import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	branchMemberships,
	branchRolePermissions,
	branches,
	organizations,
} from "@/lib/db/schema";
import { permissionsForRole } from "./permissions";

export const ACTIVE_BRANCH_COOKIE = "antropos_active_branch";

let schemaReady: Promise<void> | null = null;

export function ensureBranchSchema() {
	if (!schemaReady) {
		schemaReady = (async () => {
			await db.execute(sql.raw(`
				CREATE TABLE IF NOT EXISTS organizations (
					id serial PRIMARY KEY,
					name varchar(160) NOT NULL,
					owner_user_uid varchar(255) NOT NULL,
					created_at timestamp DEFAULT now(),
					updated_at timestamp DEFAULT now()
				);
				CREATE TABLE IF NOT EXISTS branches (
					id serial PRIMARY KEY,
					organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
					name varchar(160) NOT NULL,
					code varchar(30) NOT NULL,
					address text,
					phone varchar(30),
					timezone varchar(80) NOT NULL DEFAULT 'America/Mexico_City',
					status varchar(20) NOT NULL DEFAULT 'active',
					data_scope_uid varchar(255) NOT NULL UNIQUE,
					created_at timestamp DEFAULT now(),
					updated_at timestamp DEFAULT now()
				);
				CREATE UNIQUE INDEX IF NOT EXISTS branches_organization_code_idx ON branches(organization_id, code);
				CREATE TABLE IF NOT EXISTS branch_memberships (
					id serial PRIMARY KEY,
					branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
					user_uid varchar(255) NOT NULL,
					role varchar(30) NOT NULL DEFAULT 'viewer',
					status varchar(20) NOT NULL DEFAULT 'active',
					created_at timestamp DEFAULT now(),
					updated_at timestamp DEFAULT now()
				);
				CREATE UNIQUE INDEX IF NOT EXISTS branch_memberships_branch_user_idx ON branch_memberships(branch_id, user_uid);
				CREATE TABLE IF NOT EXISTS branch_role_permissions (
					id serial PRIMARY KEY,
					branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
					role varchar(30) NOT NULL,
					permissions text NOT NULL,
					updated_at timestamp DEFAULT now()
				);
				CREATE UNIQUE INDEX IF NOT EXISTS branch_role_permissions_branch_role_idx ON branch_role_permissions(branch_id, role);
			`));
		})();
	}
	return schemaReady;
}

export async function ensureDefaultOrganization(user: {
	id: string;
	name: string;
}) {
	await ensureBranchSchema();
	const membership = await db.query.branchMemberships.findFirst({
		where: and(
			eq(branchMemberships.user_uid, user.id),
			eq(branchMemberships.status, "active"),
		),
		with: { branch: { with: { organization: true } } },
	});
	if (membership) return membership;

	const [organization] = await db
		.insert(organizations)
		.values({ name: "Antros Club", owner_user_uid: user.id })
		.returning();
	const [branch] = await db
		.insert(branches)
		.values({
			organization_id: organization.id,
			name: "Sucursal Centro",
			code: "CENTRO",
			address: "Av. Reforma 120, Centro",
			phone: "55 5555 0101",
			data_scope_uid: user.id,
		})
		.returning();
	return (
		await db.query.branchMemberships.findFirst({
			where: eq(
				branchMemberships.id,
				(
					await db
						.insert(branchMemberships)
						.values({ branch_id: branch.id, user_uid: user.id, role: "owner" })
						.returning()
				)[0].id,
			),
			with: { branch: { with: { organization: true } } },
		})
	) as NonNullable<typeof membership>;
}

export async function getBranchAccess(userId: string, branchId: number) {
	await ensureBranchSchema();
	const membership = await db.query.branchMemberships.findFirst({
		where: and(
			eq(branchMemberships.user_uid, userId),
			eq(branchMemberships.branch_id, branchId),
			eq(branchMemberships.status, "active"),
		),
		with: { branch: { with: { organization: true } } },
	});
	if (!membership || membership.branch.status !== "active") return null;

	const override = await db.query.branchRolePermissions.findFirst({
		where: and(
			eq(branchRolePermissions.branch_id, branchId),
			eq(branchRolePermissions.role, membership.role),
		),
	});

	return {
		membership,
		permissions: permissionsForRole(membership.role, override?.permissions),
	};
}
