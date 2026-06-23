import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import {
	ingredientMovements,
	ingredients,
	recipeItems,
	recipes,
} from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface SoldItem {
	orderItemId: number;
	productId: number;
	quantity: number;
}

export async function consumeRecipeIngredients(
	tx: Transaction,
	userId: string,
	orderId: number,
	soldItems: SoldItem[],
) {
	if (soldItems.length === 0) return new Set<number>();

	const productIds = [...new Set(soldItems.map((item) => item.productId))];
	const components = await tx
		.select({
			productId: recipes.product_id,
			ingredientId: ingredients.id,
			ingredientName: ingredients.name,
			stockQuantity: ingredients.stock_quantity,
			recipeQuantity: recipeItems.quantity,
		})
		.from(recipeItems)
		.innerJoin(recipes, eq(recipeItems.recipe_id, recipes.id))
		.innerJoin(ingredients, eq(recipeItems.ingredient_id, ingredients.id))
		.where(
			and(
				eq(recipes.user_uid, userId),
				eq(ingredients.user_uid, userId),
				inArray(recipes.product_id, productIds),
			),
		);

	const requiredByIngredient = new Map<
		number,
		{ name: string; stock: number; required: number }
	>();
	const recipeManagedProductIds = new Set(
		components.map((component) => component.productId),
	);
	const movements: Array<{
		ingredient_id: number;
		order_id: number;
		order_item_id: number;
		movement_type: string;
		quantity: number;
		expected_quantity: number;
		user_uid: string;
	}> = [];

	for (const item of soldItems) {
		for (const component of components) {
			if (component.productId !== item.productId) continue;
			const required = component.recipeQuantity * item.quantity;
			const current = requiredByIngredient.get(component.ingredientId) ?? {
				name: component.ingredientName,
				stock: component.stockQuantity,
				required: 0,
			};
			current.required += required;
			requiredByIngredient.set(component.ingredientId, current);
			movements.push({
				ingredient_id: component.ingredientId,
				order_id: orderId,
				order_item_id: item.orderItemId,
				movement_type: "consumption",
				quantity: -required,
				expected_quantity: required,
				user_uid: userId,
			});
		}
	}

	for (const requirement of requiredByIngredient.values()) {
		if (requirement.stock + 0.0001 < requirement.required) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Inventario insuficiente de ${requirement.name}. Se requieren ${requirement.required.toFixed(2)} y hay ${requirement.stock.toFixed(2)}.`,
			});
		}
	}

	for (const [ingredientId, requirement] of requiredByIngredient) {
		await tx
			.update(ingredients)
			.set({
				stock_quantity: sql`${ingredients.stock_quantity} - ${requirement.required}`,
				updated_at: new Date(),
			})
			.where(
				and(eq(ingredients.id, ingredientId), eq(ingredients.user_uid, userId)),
			);
	}

	if (movements.length > 0) {
		await tx.insert(ingredientMovements).values(movements);
	}

	return recipeManagedProductIds;
}

export async function restoreOrderItemIngredients(
	tx: Transaction,
	userId: string,
	orderId: number,
	orderItemId: number,
	note: string,
) {
	const movements = await tx
		.select({
			ingredientId: ingredientMovements.ingredient_id,
			quantity: ingredientMovements.quantity,
		})
		.from(ingredientMovements)
		.where(
			and(
				eq(ingredientMovements.user_uid, userId),
				eq(ingredientMovements.order_id, orderId),
				eq(ingredientMovements.order_item_id, orderItemId),
			),
		);

	const netByIngredient = new Map<number, number>();
	for (const movement of movements) {
		netByIngredient.set(
			movement.ingredientId,
			(netByIngredient.get(movement.ingredientId) ?? 0) + movement.quantity,
		);
	}

	for (const [ingredientId, netQuantity] of netByIngredient) {
		const restoreQuantity = Math.max(0, -netQuantity);
		if (restoreQuantity === 0) continue;

		await tx
			.update(ingredients)
			.set({
				stock_quantity: sql`${ingredients.stock_quantity} + ${restoreQuantity}`,
				updated_at: new Date(),
			})
			.where(
				and(eq(ingredients.id, ingredientId), eq(ingredients.user_uid, userId)),
			);

		await tx.insert(ingredientMovements).values({
			ingredient_id: ingredientId,
			order_id: orderId,
			order_item_id: orderItemId,
			movement_type: "restoration",
			quantity: restoreQuantity,
			expected_quantity: restoreQuantity,
			notes: note,
			user_uid: userId,
		});
	}

	return [...netByIngredient.values()].some((quantity) => quantity < 0);
}
