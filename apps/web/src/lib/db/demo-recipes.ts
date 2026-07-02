import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingredientCounts, ingredients, products, recipeItems, recipes } from "@/lib/db/schema";

const ingredientDefinitions = [
	["Corona Extra", "unit", 180, 24, 48],
	["Modelo Especial", "unit", 160, 24, 48],
	["Victoria", "unit", 140, 24, 48],
	["Michelob Ultra", "unit", 120, 24, 36],
	["Heineken", "unit", 120, 24, 36],
	["XX Lager", "unit", 120, 24, 36],
	["Ron blanco", "ml", 9000, 750, 1500],
	["Ron Zacapa 23", "ml", 6000, 750, 1500],
	["Tequila blanco", "ml", 12000, 750, 2250],
	["Tequila Don Julio 70", "ml", 8400, 700, 1400],
	["Tequila Maestro Dobel Diamante", "ml", 7500, 750, 1500],
	["Whisky Buchanan's 12", "ml", 9000, 750, 1500],
	["Whisky Johnnie Walker Black", "ml", 7500, 750, 1500],
	["Vodka Grey Goose", "ml", 6000, 750, 1500],
	["Licor de naranja", "ml", 4500, 750, 750],
	["Licor 43", "ml", 4200, 700, 700],
	["Ginebra", "ml", 6000, 750, 1500],
	["Vodka", "ml", 6000, 750, 1500],
	["Jugo de limón", "ml", 6000, 1000, 1000],
	["Jarabe simple", "ml", 4000, 1000, 1000],
	["Agua mineral para barra", "ml", 18000, 355, 3550],
	["Refresco de toronja", "ml", 12000, 355, 3550],
	["Agua tónica", "ml", 12000, 355, 3550],
	["Bebida energética", "ml", 6000, 250, 1250],
	["Espresso", "ml", 4000, 1000, 500],
	["Hierbabuena", "g", 1200, 100, 200],
	["Mezcla cítrica", "ml", 5000, 1000, 1000],
	["Agua natural", "unit", 160, 24, 48],
	["Agua mineral botella", "unit", 120, 24, 36],
	["Refresco lata", "unit", 180, 24, 48],
	["Red Bull lata", "unit", 120, 24, 36],
	["Limón", "g", 8000, 1000, 1500],
	["Azúcar", "g", 5000, 1000, 1000],
	["Papa", "g", 18000, 1000, 4000],
	["Totopos", "g", 9000, 1000, 2000],
	["Queso para nachos", "g", 6000, 1000, 1500],
	["Jalapeños", "g", 2500, 500, 500],
	["Pico de gallo", "g", 3500, 1000, 800],
	["Alitas de pollo", "g", 16000, 1000, 4000],
	["Salsa BBQ", "g", 5000, 1000, 1000],
	["Verduras de servicio", "g", 6000, 1000, 1200],
	["Mini pan brioche", "unit", 90, 12, 24],
	["Carne para hamburguesa", "g", 9000, 1000, 2000],
	["Queso rebanado", "unit", 120, 24, 36],
	["Carnes frías", "g", 5000, 1000, 1200],
	["Quesos de tabla", "g", 5000, 1000, 1200],
	["Aceitunas", "g", 2500, 1000, 600],
	["Pulsera de acceso", "unit", 500, 100, 100],
	["Reserva mesa", "unit", 20, 1, 4],
	["Hielo", "g", 50000, 5000, 10000],
	["Vaso desechable", "unit", 500, 50, 100],
] as const;

const recipeDefinitions: Record<string, Array<[string, number]>> = {
	"Corona Extra": [["Corona Extra", 1]],
	"Modelo Especial": [["Modelo Especial", 1]],
	Victoria: [["Victoria", 1]],
	"Michelob Ultra": [["Michelob Ultra", 1]],
	Heineken: [["Heineken", 1]],
	"XX Lager": [["XX Lager", 1]],
	Mojito: [
		["Ron blanco", 45],
		["Jugo de limón", 25],
		["Jarabe simple", 15],
		["Agua mineral para barra", 90],
		["Hierbabuena", 8],
	],
	Margarita: [
		["Tequila blanco", 45],
		["Licor de naranja", 20],
		["Jugo de limón", 25],
	],
	Paloma: [
		["Tequila blanco", 45],
		["Refresco de toronja", 120],
		["Jugo de limón", 15],
	],
	Carajillo: [
		["Licor 43", 45],
		["Espresso", 45],
	],
	"Gin Tonic": [
		["Ginebra", 50],
		["Agua tónica", 150],
	],
	Azulito: [
		["Vodka", 45],
		["Bebida energética", 125],
		["Mezcla cítrica", 30],
	],
	"Tequila Don Julio 70": [
		["Tequila Don Julio 70", 700],
		["Agua mineral botella", 4],
		["Refresco lata", 2],
		["Limón", 120],
		["Hielo", 1000],
	],
	"Tequila Maestro Dobel Diamante": [
		["Tequila Maestro Dobel Diamante", 750],
		["Agua mineral botella", 4],
		["Refresco lata", 2],
		["Limón", 120],
		["Hielo", 1000],
	],
	"Whisky Buchanan's 12": [
		["Whisky Buchanan's 12", 750],
		["Agua mineral botella", 3],
		["Refresco lata", 3],
		["Hielo", 1000],
	],
	"Whisky Johnnie Walker Black": [
		["Whisky Johnnie Walker Black", 750],
		["Agua mineral botella", 3],
		["Refresco lata", 3],
		["Hielo", 1000],
	],
	"Vodka Grey Goose": [
		["Vodka Grey Goose", 750],
		["Bebida energética", 750],
		["Agua mineral botella", 2],
		["Limón", 100],
		["Hielo", 1000],
	],
	"Ron Zacapa 23": [
		["Ron Zacapa 23", 750],
		["Agua mineral botella", 3],
		["Refresco lata", 3],
		["Hielo", 1000],
	],
	"Agua Natural": [["Agua natural", 1]],
	"Agua Mineral": [["Agua mineral botella", 1]],
	Refresco: [["Refresco lata", 1]],
	"Red Bull": [["Red Bull lata", 1]],
	"Limonada Mineral": [
		["Jugo de limón", 45],
		["Jarabe simple", 25],
		["Agua mineral para barra", 250],
	],
	"Papas a la Francesa": [
		["Papa", 280],
		["Salsa BBQ", 30],
	],
	"Nachos con Queso": [
		["Totopos", 180],
		["Queso para nachos", 120],
		["Jalapeños", 25],
		["Pico de gallo", 80],
	],
	"Alitas BBQ": [
		["Alitas de pollo", 650],
		["Salsa BBQ", 90],
		["Verduras de servicio", 120],
	],
	"Mini Hamburguesas": [
		["Mini pan brioche", 3],
		["Carne para hamburguesa", 210],
		["Queso rebanado", 3],
		["Papa", 180],
	],
	"Tabla de Carnes Frías": [
		["Carnes frías", 220],
		["Quesos de tabla", 180],
		["Aceitunas", 80],
	],
	"Cover General": [["Pulsera de acceso", 1]],
	"Cover Evento Especial": [["Pulsera de acceso", 1]],
	"Reservación Mesa VIP": [["Reserva mesa", 1]],
	"Servicio de Mezcladores": [
		["Hielo", 1500],
		["Agua mineral botella", 4],
		["Refresco lata", 4],
		["Limón", 150],
		["Vaso desechable", 8],
	],
};

const demoProductStocks: Record<string, number> = {
	"Red Bull": 8,
	"Agua Mineral": 12,
	"Tequila Don Julio 70": 1,
	"Alitas BBQ": 3,
	Azulito: 14,
	"Whisky Buchanan's 12": 2,
	"Corona Extra": 95,
};

const demoIngredientStocks: Record<string, number> = {
	"Red Bull lata": 8,
	"Agua mineral botella": 12,
	"Tequila Don Julio 70": 700,
	"Alitas de pollo": 1800,
	"Jugo de limón": 900,
	"Limón": 1200,
	"Hielo": 7000,
	"Papa": 2400,
	"Vodka": 1350,
};

const demoAuditCounts: Record<string, { expected: number; counted: number }> = {
	"Red Bull lata": { expected: 42, counted: 31 },
	"Agua mineral botella": { expected: 36, counted: 27 },
	"Tequila Don Julio 70": { expected: 2100, counted: 1720 },
	"Alitas de pollo": { expected: 5400, counted: 4050 },
	"Vodka": { expected: 1350, counted: 1480 },
	"Jugo de limón": { expected: 900, counted: 860 },
	"Hielo": { expected: 7000, counted: 6850 },
	"Corona Extra": { expected: 95, counted: 93 },
};

export async function ensureDemoRecipes(userId: string) {
	const existingIngredients = await db
		.select()
		.from(ingredients)
		.where(eq(ingredients.user_uid, userId));
	const existingNames = new Set(
		existingIngredients.map((ingredient) => ingredient.name),
	);
	const missingDefinitions = ingredientDefinitions.filter(
		([name]) => !existingNames.has(name),
	);

	const insertedIngredients =
		missingDefinitions.length > 0
			? await db
					.insert(ingredients)
					.values(
						missingDefinitions.map(
							([name, unit, stock, packageSize, lowStock]) => ({
								name,
								unit,
								stock_quantity: stock,
								package_size: packageSize,
								low_stock_threshold: lowStock,
								user_uid: userId,
							}),
						),
					)
					.returning()
			: [];

	const ingredientByName = new Map(
		[...existingIngredients, ...insertedIngredients].map((ingredient) => [
			ingredient.name,
			ingredient,
		]),
	);
	const productRows = await db
		.select({ id: products.id, name: products.name })
		.from(products)
		.where(eq(products.user_uid, userId));

	for (const product of productRows) {
		const definition = recipeDefinitions[product.name];
		if (!definition) continue;

		const existingRecipe = await db.query.recipes.findFirst({
			where: and(
				eq(recipes.product_id, product.id),
				eq(recipes.user_uid, userId),
			),
		});
		if (existingRecipe) continue;

		const [recipe] = await db
			.insert(recipes)
			.values({ product_id: product.id, user_uid: userId })
			.returning();

		const components = definition.flatMap(([ingredientName, quantity]) => {
			const ingredient = ingredientByName.get(ingredientName);
			return ingredient
				? [
						{
							recipe_id: recipe.id,
							ingredient_id: ingredient.id,
							quantity,
						},
					]
				: [];
		});
		if (components.length > 0) {
			await db.insert(recipeItems).values(components);
		}
	}

	for (const [name, stock] of Object.entries(demoProductStocks)) {
		await db
			.update(products)
			.set({ in_stock: stock, updated_at: new Date() })
			.where(and(eq(products.user_uid, userId), eq(products.name, name)));
	}

	for (const [name, stock] of Object.entries(demoIngredientStocks)) {
		await db
			.update(ingredients)
			.set({ stock_quantity: stock, updated_at: new Date() })
			.where(and(eq(ingredients.user_uid, userId), eq(ingredients.name, name)));
	}

	await db
		.delete(ingredientCounts)
		.where(
			and(
				eq(ingredientCounts.user_uid, userId),
				eq(ingredientCounts.notes, "Demo auditoría"),
			),
		);

	const refreshedIngredients = await db
		.select()
		.from(ingredients)
		.where(eq(ingredients.user_uid, userId));
	const counts = refreshedIngredients.flatMap((ingredient) => {
		const demo = demoAuditCounts[ingredient.name];
		if (!demo) return [];
		const variance = demo.counted - demo.expected;
		const denominator = Math.max(Math.abs(demo.expected), ingredient.package_size * 0.01, 0.0001);
		const variancePercent = (variance / denominator) * 100;
		return [
			{
				ingredient_id: ingredient.id,
				expected_quantity: demo.expected,
				counted_quantity: demo.counted,
				variance_quantity: variance,
				variance_percent: variancePercent,
				exceeds_tolerance: Math.abs(variancePercent) > 7,
				notes: "Demo auditoría",
				user_uid: userId,
				created_at: new Date(),
			},
		];
	});
	if (counts.length > 0) {
		await db.insert(ingredientCounts).values(counts);
	}
}
