import { and, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { orderItems, orders, products } from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const recommendationSchema = z.object({
	productId: z.number(),
	name: z.string(),
	category: z.string().nullable(),
	currentStock: z.number(),
	unitsSold: z.number(),
	averageDailyDemand: z.number(),
	daysRemaining: z.number().nullable(),
	reorderPoint: z.number(),
	recommendedQuantity: z.number(),
	status: z.enum(["urgent", "soon", "healthy", "noDemand"]),
});

export const restockingRouter = router({
	recommendations: protectedProcedure
		.input(
			z.object({
				days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
				leadTimeDays: z.number().int().min(1).max(60),
				coverageDays: z.number().int().min(1).max(90),
			}),
		)
		.output(
			z.object({
				windowStart: z.date(),
				totalProducts: z.number(),
				urgentCount: z.number(),
				soonCount: z.number(),
				recommendedUnits: z.number(),
				items: z.array(recommendationSchema),
			}),
		)
		.query(async ({ ctx, input }) => {
			const windowStart = new Date();
			windowStart.setDate(windowStart.getDate() - input.days);

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

			const items = allProducts
				.filter((product) => product.category !== "servicios")
				.map((product) => {
					const unitsSold = salesByProduct.get(product.id) ?? 0;
					const averageDailyDemand = unitsSold / input.days;
					const reorderPoint = Math.ceil(
						averageDailyDemand * input.leadTimeDays * 1.2,
					);
					const targetStock = Math.ceil(
						averageDailyDemand *
							(input.leadTimeDays + input.coverageDays) *
							1.2,
					);
					const recommendedQuantity = Math.max(
						0,
						targetStock - product.inStock,
					);
					const daysRemaining =
						averageDailyDemand > 0
							? product.inStock / averageDailyDemand
							: null;

					let status: "urgent" | "soon" | "healthy" | "noDemand";
					if (averageDailyDemand === 0) {
						status = "noDemand";
					} else if (
						product.inStock === 0 ||
						(daysRemaining !== null && daysRemaining <= input.leadTimeDays)
					) {
						status = "urgent";
					} else if (product.inStock <= reorderPoint) {
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
						reorderPoint,
						recommendedQuantity,
						status,
					};
				})
				.sort((a, b) => {
					const priority = { urgent: 0, soon: 1, healthy: 2, noDemand: 3 };
					return (
						priority[a.status] - priority[b.status] ||
						b.recommendedQuantity - a.recommendedQuantity ||
						a.name.localeCompare(b.name)
					);
				});

			return {
				windowStart,
				totalProducts: items.length,
				urgentCount: items.filter((item) => item.status === "urgent").length,
				soonCount: items.filter((item) => item.status === "soon").length,
				recommendedUnits: items.reduce(
					(total, item) => total + item.recommendedQuantity,
					0,
				),
				items,
			};
		}),
});
