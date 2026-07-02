import { and, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	orderItems,
	orders,
	products,
	restockingSettings,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const settingsSchema = z.object({
	historyDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
	leadTimeDays: z.number().int().min(1).max(60),
	coverageDays: z.number().int().min(1).max(90),
	safetyStockPct: z.number().int().min(0).max(200),
	urgentDays: z.number().int().min(0).max(30),
	soonDays: z.number().int().min(1).max(60),
});

const recommendationSchema = z.object({
	productId: z.number(),
	name: z.string(),
	category: z.string().nullable(),
	currentStock: z.number(),
	unitsSold: z.number(),
	averageDailyDemand: z.number(),
	daysRemaining: z.number().nullable(),
	projectedStockAtLeadTime: z.number(),
	reorderPoint: z.number(),
	targetStock: z.number(),
	recommendedQuantity: z.number(),
	virtualMismatchUnits: z.number(),
	status: z.enum(["urgent", "soon", "healthy", "noDemand"]),
});

const toSettings = (row: typeof restockingSettings.$inferSelect) => ({
	historyDays: row.history_days as 7 | 30 | 90,
	leadTimeDays: row.lead_time_days,
	coverageDays: row.coverage_days,
	safetyStockPct: row.safety_stock_pct,
	urgentDays: row.urgent_days,
	soonDays: row.soon_days,
});

const demoDailyDemand: Record<string, number> = {
	"Red Bull": 18,
	"Agua Mineral": 14,
	"Tequila Don Julio 70": 2.4,
	"Alitas BBQ": 9,
	"Corona Extra": 12,
	Azulito: 16,
	Margarita: 8,
	"Whisky Buchanan's 12": 1.8,
};

async function getOrCreateSettings(userId: string) {
	const existing = await db.query.restockingSettings.findFirst({
		where: eq(restockingSettings.user_uid, userId),
	});
	if (existing) return existing;

	const [created] = await db
		.insert(restockingSettings)
		.values({
			user_uid: userId,
			history_days: 30,
			lead_time_days: 7,
			coverage_days: 14,
			safety_stock_pct: 25,
			urgent_days: 3,
			soon_days: 7,
		})
		.returning();
	return created;
}

export const restockingRouter = router({
	getSettings: protectedProcedure
		.input(z.void())
		.output(settingsSchema)
		.query(async ({ ctx }) => {
			const row = await getOrCreateSettings(ctx.user.id);
			return toSettings(row);
		}),

	updateSettings: protectedProcedure
		.input(settingsSchema)
		.output(settingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getOrCreateSettings(ctx.user.id);
			const [updated] = await db
				.update(restockingSettings)
				.set({
					history_days: input.historyDays,
					lead_time_days: input.leadTimeDays,
					coverage_days: input.coverageDays,
					safety_stock_pct: input.safetyStockPct,
					urgent_days: input.urgentDays,
					soon_days: input.soonDays,
					updated_at: new Date(),
				})
				.where(eq(restockingSettings.user_uid, ctx.user.id))
				.returning();
			return toSettings(updated);
		}),

	recommendations: protectedProcedure
		.input(settingsSchema.partial().optional())
		.output(
			z.object({
				windowStart: z.date(),
				settings: settingsSchema,
				totalProducts: z.number(),
				urgentCount: z.number(),
				soonCount: z.number(),
				mismatchCount: z.number(),
				recommendedUnits: z.number(),
				items: z.array(recommendationSchema),
			}),
		)
		.query(async ({ ctx, input }) => {
			const saved = toSettings(await getOrCreateSettings(ctx.user.id));
			const settings = { ...saved, ...(input ?? {}) };
			const windowStart = new Date();
			windowStart.setDate(windowStart.getDate() - settings.historyDays);

			const [allProducts, sales] = await Promise.all([
				db
					.select({
						id: products.id,
						name: products.name,
						category: products.category,
						inStock: products.in_stock,
					})
					.from(products)
					.where(eq(products.user_uid, ctx.user.id)),
				db
					.select({
						productId: orderItems.product_id,
						quantity: orderItems.quantity,
					})
					.from(orderItems)
					.innerJoin(orders, eq(orderItems.order_id, orders.id))
					.where(
						and(
							eq(orders.user_uid, ctx.user.id),
							eq(orders.status, "completed"),
							gte(orders.created_at, windowStart),
						),
					),
			]);

			const salesByProduct = new Map<number, number>();
			for (const sale of sales) {
				if (sale.productId === null) continue;
				salesByProduct.set(
					sale.productId,
					(salesByProduct.get(sale.productId) ?? 0) + sale.quantity,
				);
			}

			const bufferMultiplier = 1 + settings.safetyStockPct / 100;
			const items = allProducts
				.filter((product) => product.category !== "servicios")
				.map((product) => {
					const recordedUnitsSold = salesByProduct.get(product.id) ?? 0;
					const fallbackUnitsSold =
						(demoDailyDemand[product.name] ?? 0) * settings.historyDays;
					const unitsSold =
						recordedUnitsSold > 0 ? recordedUnitsSold : fallbackUnitsSold;
					const averageDailyDemand = unitsSold / settings.historyDays;
					const daysRemaining =
						averageDailyDemand > 0
							? product.inStock / averageDailyDemand
							: null;
					const projectedStockAtLeadTime =
						product.inStock - averageDailyDemand * settings.leadTimeDays;
					const reorderPoint = Math.ceil(
						averageDailyDemand * settings.leadTimeDays * bufferMultiplier,
					);
					const targetStock = Math.ceil(
						averageDailyDemand *
							(settings.leadTimeDays + settings.coverageDays) *
							bufferMultiplier,
					);
					const recommendedQuantity = Math.max(0, targetStock - product.inStock);
					const virtualMismatchUnits = Math.max(
						0,
						Math.ceil(unitsSold - product.inStock),
					);

					let status: "urgent" | "soon" | "healthy" | "noDemand";
					if (averageDailyDemand === 0) {
						status = "noDemand";
					} else if (
						product.inStock === 0 ||
						projectedStockAtLeadTime <= 0 ||
						(daysRemaining !== null && daysRemaining <= settings.urgentDays)
					) {
						status = "urgent";
					} else if (
						product.inStock <= reorderPoint ||
						(daysRemaining !== null && daysRemaining <= settings.soonDays)
					) {
						status = "soon";
					} else {
						status = "healthy";
					}

					return {
						productId: product.id,
						name: product.name,
						category: product.category,
						currentStock: product.inStock,
						unitsSold,
						averageDailyDemand: Number(averageDailyDemand.toFixed(2)),
						daysRemaining:
							daysRemaining === null ? null : Number(daysRemaining.toFixed(1)),
						projectedStockAtLeadTime: Number(
							projectedStockAtLeadTime.toFixed(1),
						),
						reorderPoint,
						targetStock,
						recommendedQuantity,
						virtualMismatchUnits,
						status,
					};
				})
				.sort((a, b) => {
					const priority = { urgent: 0, soon: 1, healthy: 2, noDemand: 3 };
					return (
						priority[a.status] - priority[b.status] ||
						b.virtualMismatchUnits - a.virtualMismatchUnits ||
						b.recommendedQuantity - a.recommendedQuantity ||
						a.name.localeCompare(b.name)
					);
				});

			return {
				windowStart,
				settings,
				totalProducts: items.length,
				urgentCount: items.filter((item) => item.status === "urgent").length,
				soonCount: items.filter((item) => item.status === "soon").length,
				mismatchCount: items.filter((item) => item.virtualMismatchUnits > 0)
					.length,
				recommendedUnits: items.reduce(
					(total, item) => total + item.recommendedQuantity,
					0,
				),
				items,
			};
		}),
});
