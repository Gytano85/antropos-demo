import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pricingSettings } from "@/lib/db/schema";
import {
	DEFAULT_PRICING_SETTINGS,
	type PricingSettingsValues,
} from "./dynamic-pricing";

type PricingSettingsRow = typeof pricingSettings.$inferSelect;

/**
 * Devuelve la configuración de precios dinámicos del usuario, creándola con
 * valores predeterminados si todavía no existe.
 */
export async function getOrCreatePricingSettings(
	userId: string,
): Promise<PricingSettingsRow> {
	const existing = await db.query.pricingSettings.findFirst({
		where: eq(pricingSettings.user_uid, userId),
	});
	if (existing) return existing;

	const [created] = await db
		.insert(pricingSettings)
		.values({
			user_uid: userId,
			enabled: DEFAULT_PRICING_SETTINGS.enabled,
			capacity: DEFAULT_PRICING_SETTINGS.capacity,
			min_adjustment_pct: DEFAULT_PRICING_SETTINGS.minAdjustmentPct,
			max_adjustment_pct: DEFAULT_PRICING_SETTINGS.maxAdjustmentPct,
			drunk_threshold: DEFAULT_PRICING_SETTINGS.drunkThreshold,
			drunk_surge_pct: DEFAULT_PRICING_SETTINGS.drunkSurgePct,
		})
		.onConflictDoNothing({ target: pricingSettings.user_uid })
		.returning();

	if (created) return created;

	// Otra petición concurrente ya la creó primero.
	const row = await db.query.pricingSettings.findFirst({
		where: eq(pricingSettings.user_uid, userId),
	});
	if (!row) {
		throw new Error("No se pudo crear la configuración de precios dinámicos.");
	}
	return row;
}

export function toSettingsValues(row: PricingSettingsRow): PricingSettingsValues {
	return {
		enabled: row.enabled,
		capacity: row.capacity,
		minAdjustmentPct: row.min_adjustment_pct,
		maxAdjustmentPct: row.max_adjustment_pct,
		drunkThreshold: row.drunk_threshold,
		drunkSurgePct: row.drunk_surge_pct,
	};
}
