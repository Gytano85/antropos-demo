import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { orders, products, user } from "@/lib/db/schema";

async function safeCount(label: string, query: Promise<unknown>) {
	try {
		return { label, ok: true, data: await query };
	} catch (error) {
		return {
			label,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function GET() {
	const cwd = process.cwd();
	const bundledCandidates = [
		join(cwd, "demo-data", "pglite"),
		join(cwd, "apps", "web", "demo-data", "pglite"),
		join(cwd, ".next", "standalone", "apps", "web", "demo-data", "pglite"),
	];

	const [users, productCounts, orderCounts, demoUser, tableCheck] = await Promise.all([
		safeCount(
			"users",
			db.select({ count: sql<number>`count(*)` }).from(user),
		),
		safeCount(
			"productsByUser",
			db
				.select({ user_uid: products.user_uid, count: sql<number>`count(*)` })
				.from(products)
				.groupBy(products.user_uid),
		),
		safeCount(
			"ordersByUser",
			db
				.select({ user_uid: orders.user_uid, count: sql<number>`count(*)` })
				.from(orders)
				.groupBy(orders.user_uid),
		),
		safeCount(
			"demoUser",
			db
				.select({ id: user.id, email: user.email })
				.from(user)
				.where(sql`${user.email} = ${"test@example.com"}`)
				.limit(1),
		),
		safeCount("tableCheck", db.execute(sql`select to_regclass('products') as products_table`)),
	]);

	return NextResponse.json({
		commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
		deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
		nodeEnv: process.env.NODE_ENV,
		vercel: Boolean(process.env.VERCEL),
		hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
		hasPgliteDataDir: Boolean(process.env.PGLITE_DATA_DIR),
		cwd,
		bundledCandidates: bundledCandidates.map((path) => ({ path, exists: existsSync(path) })),
		checks: { users, productCounts, orderCounts, demoUser, tableCheck },
	});
}
