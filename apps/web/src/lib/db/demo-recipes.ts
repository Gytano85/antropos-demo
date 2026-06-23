import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingredients, products, recipeItems, recipes } from "@/lib/db/schema";

const ingredientDefinitions = [
	["Ron blanco", "ml", 9000, 750, 1500],
	["Tequila blanco", "ml", 12000, 750, 2250],
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
] as const;

const recipeDefinitions: Record<string, Array<[string, number]>> = {
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
}
