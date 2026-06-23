import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { orders, pricingSettings } from "@/lib/db/schema";
import {
	getOccupancyAdjustmentPct,
	getOccupancyRatio,
	isAlcoholCategory,
	isLikelyIntoxicated,
} from "@/lib/pricing/dynamic-pricing";
import { getOrCreatePricingSettings, toSettingsValues } from "@/lib/pricing/settings";
import { protectedProcedure, router } from "../init";

const settingsSchema = z.object({
	enabled: z.boolean(),
	capacity: z.number().int().min(1).max(500),
	minAdjustmentPct: z.number().int().min(-90).max(100),
	maxAdjustmentPct: z.number().int().min(-90).max(300),
	drunkThreshold: z.number().min(0.1).max(50),
	drunkSurgePct: z.number().int().min(0).max(500),
});

const tableStatusSchema = z.object({
	orderId: z.number(),
	tableName: z.string().nullable(),
	partySize: z.number(),
	alcoholUnits: z.number(),
	unitsPerPerson: z.number(),
	flagged: z.boolean(),
});

const statusSchema = z.object({
	settings: settingsSchema,
	openTablesCount: z.number(),
	occupancyRatio: z.number(),
	occupancyAdjustmentPct: z.number(),
	tables: z.array(tableStatusSchema),
});

export const pricingRouter = router({
	getSettings: protectedProcedure
		.output(settingsSchema)
		.query(async ({ ctx }) => {
			const row = await getOrCreatePricingSettings(ctx.user.id);
			return toSettingsValues(row);
		}),

	updateSettings: protectedProcedure
		.input(
			settingsSchema.refine(
				(data) => data.maxAdjustmentPct >= data.minAdjustmentPct,
				{
					message:
						"El ajuste máximo (lleno) debe ser mayor o igual al ajuste mínimo (vacío).",
					path: ["maxAdjustmentPct"],
				},
			),
		)
		.output(settingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getOrCreatePricingSettings(ctx.user.id);

			const [updated] = await db
				.update(pricingSettings)
				.set({
					enabled: input.enabled,
					capacity: input.capacity,
					min_adjustment_pct: input.minAdjustmentPct,
					max_adjustment_pct: input.maxAdjustmentPct,
					drunk_threshold: input.drunkThreshold,
					drunk_surge_pct: input.drunkSurgePct,
					updated_at: new Date(),
				})
				.where(eq(pricingSettings.user_uid, ctx.user.id))
				.returning();

			return toSettingsValues(updated);
		}),

	getStatus: protectedProcedure.output(statusSchema).query(async ({ ctx }) => {
		const settingsRow = await getOrCreatePricingSettings(ctx.user.id);
		const settings = toSettingsValues(settingsRow);

		const openOrders = await db.query.orders.findMany({
			where: and(
				eq(orders.user_uid, ctx.user.id),
				eq(orders.status, "pending"),
				isNotNull(orders.table_name),
			),
			with: {
				orderItems: {
					with: {
						product: { columns: { category: true } },
					},
				},
			},
		});

		const openTablesCount = openOrders.length;
		const occupancyRatio = getOccupancyRatio(openTablesCount, settings.capacity);
		const occupancyAdjustmentPct = Math.round(
			settings.enabled ? getOccupancyAdjustmentPct(occupancyRatio, settings) : 0,
		);

		const tables = openOrders.map((order) => {
			const alcoholUnits = order.orderItems
				.filter((item) => isAlcoholCategory(item.product?.category))
				.reduce((sum, item) => sum + item.quantity, 0);
			const partySize = order.party_size ?? 1;
			const flagged =
				settings.enabled &&
				isLikelyIntoxicated(alcoholUnits, partySize, settings);

			return {
				orderId: order.id,
				tableName: order.table_name,
				partySize,
				alcoholUnits,
				unitsPerPerson: partySize > 0 ? alcoholUnits / partySize : 0,
				flagged,
			};
		});

		return {
			settings,
			openTablesCount,
			occupancyRatio,
			occupancyAdjustmentPct,
			tables,
		};
	}),
});
