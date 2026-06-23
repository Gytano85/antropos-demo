/**
 * Precios dinámicos de alcohol.
 *
 * Reglas de negocio:
 * - Con pocas mesas abiertas (poca ocupación) el precio del alcohol baja.
 * - Con el lugar lleno (mucha ocupación) el precio del alcohol sube.
 * - Si una mesa está consumiendo más alcohol del razonable para su número de
 *   personas, se considera "posible exceso" y se aplica un recargo adicional.
 *
 * Este módulo es puro (sin acceso a base de datos) para poder probarse y
 * reutilizarse tanto en el servidor (routers tRPC) como, si hace falta, en el
 * cliente para previsualizar precios.
 */

export const ALCOHOL_CATEGORIES = ["cervezas", "cocteles", "botellas"] as const;

export type AlcoholCategory = (typeof ALCOHOL_CATEGORIES)[number];

export function isAlcoholCategory(
	category: string | null | undefined,
): boolean {
	if (!category) return false;
	return (ALCOHOL_CATEGORIES as readonly string[]).includes(category);
}

export type PricingSettingsValues = {
	enabled: boolean;
	/** Mesas abiertas que se consideran 100% de ocupación ("lleno"). */
	capacity: number;
	/** % de ajuste sobre el precio base con 0 mesas abiertas (negativo = descuento). */
	minAdjustmentPct: number;
	/** % de ajuste sobre el precio base con ocupación al 100%. */
	maxAdjustmentPct: number;
	/** Bebidas alcohólicas por persona a partir de las cuales se sospecha exceso. */
	drunkThreshold: number;
	/** % extra de recargo cuando se detecta posible exceso. */
	drunkSurgePct: number;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettingsValues = {
	enabled: true,
	capacity: 15,
	minAdjustmentPct: -15,
	maxAdjustmentPct: 25,
	drunkThreshold: 3,
	drunkSurgePct: 20,
};

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Proporción de ocupación entre 0 (vacío) y 1 (lleno o más). */
export function getOccupancyRatio(openTables: number, capacity: number): number {
	if (capacity <= 0) return openTables > 0 ? 1 : 0;
	return clamp(openTables / capacity, 0, 1);
}

/** Interpola linealmente entre el % mínimo (vacío) y el % máximo (lleno). */
export function getOccupancyAdjustmentPct(
	ratio: number,
	settings: Pick<PricingSettingsValues, "minAdjustmentPct" | "maxAdjustmentPct">,
): number {
	return (
		settings.minAdjustmentPct +
		(settings.maxAdjustmentPct - settings.minAdjustmentPct) * ratio
	);
}

/** ¿El consumo de alcohol de esta mesa, por persona, sugiere posible exceso? */
export function isLikelyIntoxicated(
	alcoholUnits: number,
	partySize: number,
	settings: Pick<PricingSettingsValues, "drunkThreshold">,
): boolean {
	if (partySize <= 0) return false;
	return alcoholUnits / partySize > settings.drunkThreshold;
}

export type AlcoholPriceResult = {
	/** Precio final ya redondeado, en la misma unidad que basePrice (centavos). */
	price: number;
	occupancyAdjustmentPct: number;
	intoxicationFlag: boolean;
	/** % total combinado (ocupación + posible exceso) realmente aplicado. */
	totalAdjustmentPct: number;
};

export function computeAlcoholPrice(
	basePrice: number,
	params: {
		openTables: number;
		/** Unidades de alcohol totales de la mesa, incluyendo la que se está agregando. */
		alcoholUnitsForParty: number;
		partySize: number;
		settings: PricingSettingsValues;
	},
): AlcoholPriceResult {
	const { openTables, alcoholUnitsForParty, partySize, settings } = params;

	if (!settings.enabled) {
		return {
			price: basePrice,
			occupancyAdjustmentPct: 0,
			intoxicationFlag: false,
			totalAdjustmentPct: 0,
		};
	}

	const ratio = getOccupancyRatio(openTables, settings.capacity);
	const occupancyAdjustmentPct = getOccupancyAdjustmentPct(ratio, settings);
	const intoxicationFlag = isLikelyIntoxicated(
		alcoholUnitsForParty,
		partySize,
		settings,
	);

	const occupancyMultiplier = 1 + occupancyAdjustmentPct / 100;
	const drunkMultiplier = intoxicationFlag ? 1 + settings.drunkSurgePct / 100 : 1;
	const totalMultiplier = occupancyMultiplier * drunkMultiplier;

	const price = Math.max(0, Math.round(basePrice * totalMultiplier));
	const totalAdjustmentPct = Math.round((totalMultiplier - 1) * 100);

	return {
		price,
		occupancyAdjustmentPct: Math.round(occupancyAdjustmentPct),
		intoxicationFlag,
		totalAdjustmentPct,
	};
}
