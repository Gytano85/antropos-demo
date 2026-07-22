import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import {
	ACTIVE_BRANCH_COOKIE,
	ensureDefaultOrganization,
	getBranchAccess,
} from "./branches/service";
import { db } from "./db";
import { user } from "./db/schema";

export async function getIdentityUser() {
	// La sesion real manda sobre la cookie de demo. Al reves, entrar con otra
	// cuenta no surtia efecto: la cookie seguia ahi de un acceso anterior como
	// propietario y todas las peticiones se resolvian como ese usuario, asi que
	// un mesero veia todos los modulos y las dos sucursales.
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (session?.user) return session.user;

	const cookieStore = await cookies();
	if (cookieStore.get("antropos_demo_session")?.value === "1") {
		const demoUser = await getDemoUser();

		if (demoUser) return demoUser;
	}

	if (process.env.VERCEL) {
		return await getDemoUser();
	}

	return null;
}

export async function getAuthUser() {
	const identity = await getIdentityUser();
	if (!identity) return null;

	await ensureDefaultOrganization(identity);
	const cookieStore = await cookies();
	const branchId = Number(cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value);
	if (!Number.isInteger(branchId) || branchId <= 0) {
		return {
			...identity,
			accountUserId: identity.id,
			branchId: null,
			branchName: null,
			organizationId: null,
			role: null,
			permissions: [],
		};
	}

	const access = await getBranchAccess(identity.id, branchId);
	if (!access) {
		return {
			...identity,
			accountUserId: identity.id,
			branchId: null,
			branchName: null,
			organizationId: null,
			role: null,
			permissions: [],
		};
	}

	const { membership, permissions } = access;
	return {
		...identity,
		id: membership.branch.data_scope_uid,
		accountUserId: identity.id,
		branchId: membership.branch.id,
		branchName: membership.branch.name,
		organizationId: membership.branch.organization_id,
		role: membership.role,
		permissions,
	};
}

async function getDemoUser() {
	return await db.query.user.findFirst({
		where: eq(user.email, "test@example.com"),
		columns: {
			id: true,
			name: true,
			email: true,
		},
	});
}
