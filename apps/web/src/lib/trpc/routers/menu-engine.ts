import { and, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	ingredients,
	orderItems,
	orders,
	products,
	recipes,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const weightsSchema = z.object({
	demand: z.number().min(0).max(100).default(24),
	margin: z.number().min(0).max(100).default(20),
	quality: z.number().min(0).max(100).default(26),
	stock: z.number().min(0).max(100).default(20),
	manual: z.number().min(0).max(100).default(10),
});

const scenarioSchema = z.enum([
	"none",
	"lemon_expiring",
	"redbull_low_stock",
	"wings_expiring",
	"tequila_overstock",
	"weekend_beer_push",
]);

const inputSchema = z
	.object({
		weights: weightsSchema.optional(),
		scenario: scenarioSchema.optional(),
	})
	.optional();

type Weights = z.infer<typeof weightsSchema>;

const defaultWeights: Weights = {
	demand: 24,
	margin: 20,
	quality: 26,
	stock: 20,
	manual: 10,
};

const categoryCostRate: Record<string, number> = {
	botellas: 0.48,
	cocteles: 0.34,
	cervezas: 0.42,
	sin_alcohol: 0.3,
	sin_alcohol_normalized: 0.3,
	snacks: 0.38,
	alimentos: 0.38,
	promos: 0.46,
	servicios: 0.12,
};

const manualBoostByName: Record<string, number> = {
	Azulito: 8,
	"Alitas BBQ": 10,
	"Red Bull": 4,
	"Agua Mineral": 3,
	"Tequila Don Julio 70": 5,
	"Corona Extra": 2,
	"Limonada Mineral": 6,
	Margarita: 5,
};

const publicCategoryLabels: Record<string, string> = {
	botellas: "Botellas VIP",
	cocteles: "Coctelería",
	cervezas: "Cervezas",
	sin_alcohol: "Sin alcohol",
	snacks: "Alimentos",
	alimentos: "Alimentos",
	servicios: "Servicios",
};

function normalizeCategory(category: string | null) {
	if (!category) return "otros";
	if (category === "sin_alcohol") return "sin_alcohol";
	if (category === "snacks") return "alimentos";
	return category;
}

function clamp(value: number, min = 0, max = 100) {
	return Math.max(min, Math.min(max, value));
}

function safeRound(value: number, digits = 0) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function customerTag(score: number, stockStatus: string, qualityStatus: string) {
	if (stockStatus === "No promover") return "Ocultar";
	if (qualityStatus === "Priorizar") return "Especial";
	if (score >= 78) return "Recomendado";
	if (score >= 62) return "Favorito";
	return "Clásico";
}

export const menuEngineRouter = router({
	recommendations: protectedProcedure
		.input(inputSchema)
		.query(async ({ ctx, input }) => {
			const weights = { ...defaultWeights, ...(input?.weights ?? {}) };
			const scenario = input?.scenario ?? "none";
			const windowStart = new Date();
			windowStart.setDate(windowStart.getDate() - 30);

			const [productRows, recipeRows, salesRows] = await Promise.all([
				db.query.products.findMany({
					where: eq(products.user_uid, ctx.user.id),
				}),
				db.query.recipes.findMany({
					where: eq(recipes.user_uid, ctx.user.id),
					with: {
						items: {
							with: {
								ingredient: true,
							},
						},
					},
				}),
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
							gte(orders.created_at, windowStart),
						),
					),
			]);

			const salesByProduct = new Map<number, number>();
			for (const row of salesRows) {
				if (!row.productId) continue;
				salesByProduct.set(
					row.productId,
					(salesByProduct.get(row.productId) ?? 0) + row.quantity,
				);
			}

			const recipesByProduct = new Map(
				recipeRows.map((recipe) => [recipe.product_id, recipe]),
			);
			const maxSales = Math.max(...Array.from(salesByProduct.values()), 1);

			const items = productRows
				.filter((product) => product.category !== "servicios")
				.map((product) => {
					const category = normalizeCategory(product.category);
					const recipe = recipesByProduct.get(product.id);
					const unitsSold = salesByProduct.get(product.id) ?? 0;
					const demandScore = clamp((unitsSold / maxSales) * 100);
					const costRate =
						categoryCostRate[category] ?? categoryCostRate[product.category ?? ""] ?? 0.4;
					const marginScore = clamp((1 - costRate) * 100);
					const productStock = product.in_stock;
					const ingredientServings =
						recipe && recipe.items.length > 0
							? Math.floor(
									Math.min(
										...recipe.items.map((item) =>
											item.quantity > 0
												? item.ingredient.stock_quantity / item.quantity
												: 0,
										),
									),
								)
							: productStock;
					let available = Math.max(0, Math.min(productStock, ingredientServings));

					const qualitySignals = recipe?.items.map((item) => {
						const life = item.ingredient.shelf_life_days ?? defaultLife(item.ingredient.name, item.ingredient.unit);
						const opened = item.ingredient.opened_days ?? 0;
						const daysLeft = Math.max(0, life - opened);
						return {
							name: item.ingredient.name,
							daysLeft,
							life,
						};
					}) ?? [];
					let shortestLife = qualitySignals.length
						? Math.min(...qualitySignals.map((signal) => signal.daysLeft))
						: null;

					let scenarioBoost = 0;
					const scenarioReasons: string[] = [];
					if (scenario === "lemon_expiring") {
						const usesLemon = qualitySignals.some((signal) =>
							signal.name.toLowerCase().includes("lim"),
						);
						if (usesLemon || product.name.toLowerCase().includes("limonada") || product.name.toLowerCase().includes("margarita")) {
							shortestLife = Math.min(shortestLife ?? 2, 1);
							scenarioBoost += 22;
							scenarioReasons.push("Simulación: limón cerca de vencer");
						}
					}
					if (scenario === "redbull_low_stock" && product.name.toLowerCase().includes("red bull")) {
						available = 3;
						scenarioBoost -= 35;
						scenarioReasons.push("Simulación: Red Bull con poco stock");
					}
					if (scenario === "wings_expiring" && product.name.toLowerCase().includes("alitas")) {
						shortestLife = 1;
						scenarioBoost += 24;
						scenarioReasons.push("Simulación: alitas cerca de vencer");
					}
					if (scenario === "tequila_overstock" && product.name.toLowerCase().includes("tequila")) {
						available += 30;
						scenarioBoost += 18;
						scenarioReasons.push("Simulación: sobreinventario de tequila");
					}
					if (scenario === "weekend_beer_push" && category === "cervezas") {
						scenarioBoost += 16;
						scenarioReasons.push("Simulación: empuje de cervezas fin de semana");
					}

					const qualityScore =
						shortestLife === null
							? 36
							: shortestLife <= 1
								? 100
								: shortestLife <= 3
									? 82
									: shortestLife <= 7
										? 58
										: 24;
					const stockScore = clamp((available / 30) * 100);
					const lowStockPenalty = available <= 0 ? 100 : available <= 4 ? 55 : available <= 8 ? 24 : 0;
					const manualScore = manualBoostByName[product.name] ?? 0;
					const score = clamp(
						(demandScore * weights.demand +
							marginScore * weights.margin +
							qualityScore * weights.quality +
							stockScore * weights.stock +
							manualScore * weights.manual) /
							Math.max(
								1,
								weights.demand + weights.margin + weights.quality + weights.stock + weights.manual,
							) +
							scenarioBoost -
							lowStockPenalty,
					);
					const action =
						available <= 0
							? "Ocultar"
							: available <= 4
								? "Bajar"
								: score >= 76
									? "Destacar"
									: score >= 58
										? "Promover"
										: "Mantener";
					const qualityStatus =
						shortestLife !== null && shortestLife <= 2
							? "Priorizar"
							: shortestLife !== null && shortestLife <= 5
								? "Vigilar"
								: "Normal";
					const stockStatus =
						available <= 0
							? "No promover"
							: available <= 4
								? "Bajo"
								: available <= 8
									? "Limitado"
									: "Disponible";
					const reasons = [
						`Demanda ${safeRound(demandScore)} / 100`,
						`Margen estimado ${safeRound(marginScore)} / 100`,
						`Stock vendible ${safeRound(available)} unidades`,
						shortestLife !== null
							? `Vida útil mínima: ${safeRound(shortestLife, 1)} días`
							: "Sin alerta de vida útil",
						...scenarioReasons,
					];

					return {
						id: product.id,
						name: product.name,
						description: product.description,
						imageUrl: product.image_url,
						price: product.price,
						category,
						categoryLabel: publicCategoryLabels[category] ?? category,
						score: safeRound(score, 1),
						action,
						customerTag: customerTag(score, stockStatus, qualityStatus),
						stockStatus,
						qualityStatus,
						available: safeRound(available, 1),
						unitsSold,
						demandScore: safeRound(demandScore, 1),
						marginScore: safeRound(marginScore, 1),
						qualityScore: safeRound(qualityScore, 1),
						stockScore: safeRound(stockScore, 1),
						shortestLife,
						reasons,
					};
				})
				.sort((a, b) => b.score - a.score);

			const sections = Object.values(
				items.reduce<Record<string, { category: string; label: string; score: number; count: number }>>(
					(acc, item) => {
						const current = acc[item.category] ?? {
							category: item.category,
							label: item.categoryLabel,
							score: 0,
							count: 0,
						};
						current.score += item.score;
						current.count += 1;
						acc[item.category] = current;
						return acc;
					},
					{},
				),
			)
				.map((section) => ({
					...section,
					averageScore: safeRound(section.score / Math.max(section.count, 1), 1),
				}))
				.sort((a, b) => b.averageScore - a.averageScore);

			return {
				weights,
				scenario,
				items,
				sections,
				hero: items[0] ?? null,
				highlights: items.slice(0, 6),
				hidden: items.filter((item) => item.action === "Ocultar"),
			};
		}),
});

function defaultLife(name: string, unit: string) {
	const lower = name.toLowerCase();
	if (unit === "unit") return 365;
	if (lower.includes("lim") || lower.includes("jugo")) return 7;
	if (lower.includes("alita") || lower.includes("pollo") || lower.includes("carne")) return 4;
	if (unit === "ml") return 60;
	return 10;
}
