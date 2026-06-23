import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	ingredientCounts,
	ingredientMovements,
	ingredients,
	products,
	recipeItems,
	recipes,
	user,
} from "@/lib/db/schema";

const directProductNames = [
	"Corona Extra",
	"Modelo Especial",
	"Victoria",
	"Michelob Ultra",
	"Heineken",
	"XX Lager",
	"Tequila Don Julio 70",
	"Tequila Maestro Dobel Diamante",
	"Whisky Buchanan's 12",
	"Whisky Johnnie Walker Black",
	"Vodka Grey Goose",
	"Ron Zacapa 23",
];

const duplicateIngredientNames = [
	"Corona Extra 355 ml",
	"Modelo Especial 355 ml",
	"Victoria 355 ml",
	"Michelob Ultra 355 ml",
	"Heineken 355 ml",
	"XX Lager 355 ml",
	"Don Julio 70",
	"Maestro Dobel Diamante",
	"Buchanan's 12",
	"Johnnie Walker Black",
	"Grey Goose",
	"Ron Zacapa 23",
];

const demoUser = await db.query.user.findFirst({
	where: eq(user.email, "test@example.com"),
});

if (!demoUser) {
	console.log("Demo user not found; inventory normalization skipped.");
} else {
	await db.transaction(async (tx) => {
		const directProducts = await tx
			.select({ id: products.id })
			.from(products)
			.where(
				and(
					eq(products.user_uid, demoUser.id),
					inArray(products.name, directProductNames),
				),
			);
		const productIds = directProducts.map((product) => product.id);

		if (productIds.length > 0) {
			const directRecipes = await tx
				.select({ id: recipes.id })
				.from(recipes)
				.where(
					and(
						eq(recipes.user_uid, demoUser.id),
						inArray(recipes.product_id, productIds),
					),
				);
			const recipeIds = directRecipes.map((recipe) => recipe.id);
			if (recipeIds.length > 0) {
				await tx
					.delete(recipeItems)
					.where(inArray(recipeItems.recipe_id, recipeIds));
				await tx.delete(recipes).where(inArray(recipes.id, recipeIds));
			}
		}

		const duplicateIngredients = await tx
			.select({ id: ingredients.id })
			.from(ingredients)
			.where(
				and(
					eq(ingredients.user_uid, demoUser.id),
					inArray(ingredients.name, duplicateIngredientNames),
				),
			);

		for (const ingredient of duplicateIngredients) {
			const usage = await tx.query.recipeItems.findFirst({
				where: eq(recipeItems.ingredient_id, ingredient.id),
			});
			if (usage) continue;
			await tx
				.delete(ingredientMovements)
				.where(eq(ingredientMovements.ingredient_id, ingredient.id));
			await tx
				.delete(ingredientCounts)
				.where(eq(ingredientCounts.ingredient_id, ingredient.id));
			await tx.delete(ingredients).where(eq(ingredients.id, ingredient.id));
		}
	});

	console.log(
		"Inventory normalized: direct products use the original stock only.",
	);
}
