"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BRANCH_COOKIE, getBranchAccess } from "@/lib/branches/service";
import { getIdentityUser } from "@/lib/auth-guard";

export async function selectBranch(formData: FormData) {
	const identity = await getIdentityUser();
	if (!identity) redirect("/login");
	const branchId = Number(formData.get("branchId"));
	if (!Number.isInteger(branchId) || !(await getBranchAccess(identity.id, branchId))) redirect("/branches?error=branch-access");
	const cookieStore = await cookies();
	cookieStore.set(ACTIVE_BRANCH_COOKIE, String(branchId), {
		httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
	});
	redirect("/admin");
}
