import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { orders, products, user } from "@/lib/db/schema";
import { createCallerFactory } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/router";

async function safeQuery(label: string, query: Promise<unknown>) {
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

export async function getDemoDiagnostics() {
	const cwd = process.cwd();
	const bundledCandidates = [
		join(cwd, "demo-data", "pglite"),
		join(cwd, "apps", "web", "demo-data", "pglite"),
		join(cwd, ".next", "standalone", "apps", "web", "demo-data", "pglite"),
	];

	const [users, productCounts, orderCounts, demoUser, tableCheck] = await Promise.all([
		safeQuery("users", db.select({ count: sql<number>`count(*)` }).from(user)),
		safeQuery(
			"productsByUser",
			db
				.select({ user_uid: products.user_uid, count: sql<number>`count(*)` })
				.from(products)
				.groupBy(products.user_uid),
		),
		safeQuery(
			"ordersByUser",
			db
				.select({ user_uid: orders.user_uid, count: sql<number>`count(*)` })
				.from(orders)
				.groupBy(orders.user_uid),
		),
		safeQuery(
			"demoUser",
			db
				.select({ id: user.id, email: user.email })
				.from(user)
				.where(sql`${user.email} = ${"test@example.com"}`)
				.limit(1),
		),
		safeQuery("tableCheck", db.execute(sql`select to_regclass('products') as products_table`)),
	]);
	const demoUserRow =
		demoUser.ok && Array.isArray(demoUser.data) ? demoUser.data[0] : null;
	const caller = demoUserRow
		? createCallerFactory(appRouter)({
				user: {
					id: demoUserRow.id,
					email: demoUserRow.email,
					name: "Demo",
				},
			})
		: null;
	const [productsRouter, tablesRouter, restockingRouter, dashboardRouter] =
		await Promise.all([
			safeQuery(
				"trpc.products.list",
				caller ? caller.products.list() : Promise.resolve(null),
			),
			safeQuery(
				"trpc.tables.listOpen",
				caller ? caller.tables.listOpen() : Promise.resolve(null),
			),
			safeQuery(
				"trpc.restocking.recommendations",
				caller
					? caller.restocking.recommendations({
							historyDays: 30,
							leadTimeDays: 7,
							coverageDays: 14,
							safetyStockPct: 25,
							urgentDays: 3,
							soonDays: 7,
						})
					: Promise.resolve(null),
			),
			safeQuery(
				"trpc.dashboard.stats",
				caller ? caller.dashboard.stats() : Promise.resolve(null),
			),
		]);

	return {
		commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
		deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
		nodeEnv: process.env.NODE_ENV,
		vercel: Boolean(process.env.VERCEL),
		hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
		hasPgliteDataDir: Boolean(process.env.PGLITE_DATA_DIR),
		cwd,
		bundledCandidates: bundledCandidates.map((path) => ({ path, exists: existsSync(path) })),
		checks: { users, productCounts, orderCounts, demoUser, tableCheck },
		routerChecks: {
			productsList:
				productsRouter.ok && Array.isArray(productsRouter.data)
					? { ...productsRouter, count: productsRouter.data.length }
					: productsRouter,
			tablesListOpen:
				tablesRouter.ok && Array.isArray(tablesRouter.data)
					? { ...tablesRouter, count: tablesRouter.data.length }
					: tablesRouter,
			restockingRecommendations:
				restockingRouter.ok && restockingRouter.data
					? {
							...restockingRouter,
							summary: {
								totalProducts: (restockingRouter.data as any).totalProducts,
								items: (restockingRouter.data as any).items?.length,
								urgentCount: (restockingRouter.data as any).urgentCount,
								soonCount: (restockingRouter.data as any).soonCount,
							},
						}
					: restockingRouter,
			dashboardStats: dashboardRouter,
		},
	};
}
