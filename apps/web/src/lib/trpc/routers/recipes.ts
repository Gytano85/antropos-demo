import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	ingredientCounts,
	ingredientMovements,
	ingredients,
	orderItems,
	orders,
	products,
	recipeItems,
	recipes,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const TOLERANCE_PERCENT = 7;

export const recipesRouter = router({
	overview: protectedProcedure.query(async ({ ctx }) => {
		const [ingredientRows, recipeRows, productRows] = await Promise.all([
			db
				.select()
				.from(ingredients)
				.where(eq(ingredients.user_uid, ctx.user.id))
				.orderBy(ingredients.name),
			db.query.recipes.findMany({
				where: eq(recipes.user_uid, ctx.user.id),
				with: {
					product: {
						columns: { id: true, name: true, category: true },
					},
					items: {
						with: {
							ingredient: true,
						},
					},
				},
			}),
			db
				.select({
					id: products.id,
					name: products.name,
					category: products.category,
				})
				.from(products)
				.where(eq(products.user_uid, ctx.user.id))
				.orderBy(products.name),
		]);

		return {
			tolerancePercent: TOLERANCE_PERCENT,
			ingredients: ingredientRows,
			recipes: recipeRows,
			products: productRows,
		};
	}),

	createIngredient: protectedProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(255),
				unit: z.enum(["ml", "g", "unit"]),
				stockQuantity: z.number().min(0),
				packageSize: z.number().positive(),
				lowStockThreshold: z.number().min(0),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [created] = await db
				.insert(ingredients)
				.values({
					name: input.name,
					unit: input.unit,
					stock_quantity: input.stockQuantity,
					package_size: input.packageSize,
					low_stock_threshold: input.lowStockThreshold,
					user_uid: ctx.user.id,
				})
				.returning();
			return created;
		}),

	updateIngredient: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().trim().min(1).max(255),
				unit: z.enum(["ml", "g", "unit"]),
				packageSize: z.number().positive(),
				lowStockThreshold: z.number().min(0),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(ingredients)
				.set({
					name: input.name,
					unit: input.unit,
					package_size: input.packageSize,
					low_stock_threshold: input.lowStockThreshold,
					updated_at: new Date(),
				})
				.where(
					and(
						eq(ingredients.id, input.id),
						eq(ingredients.user_uid, ctx.user.id),
					),
				)
				.returning();
			return updated;
		}),

	restockIngredient: protectedProcedure
		.input(
			z.object({
				ingredientId: z.number(),
				quantity: z.number().positive(),
				notes: z.string().max(500).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return db.transaction(async (tx) => {
				const ingredient = await tx.query.ingredients.findFirst({
					where: and(
						eq(ingredients.id, input.ingredientId),
						eq(ingredients.user_uid, ctx.user.id),
					),
				});
				if (!ingredient) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Ingrediente no encontrado.",
					});
				}

				await tx
					.update(ingredients)
					.set({
						stock_quantity: sql`${ingredients.stock_quantity} + ${input.quantity}`,
						updated_at: new Date(),
					})
					.where(eq(ingredients.id, input.ingredientId));

				await tx.insert(ingredientMovements).values({
					ingredient_id: input.ingredientId,
					movement_type: "restock",
					quantity: input.quantity,
					notes: input.notes,
					user_uid: ctx.user.id,
				});
				return { success: true };
			});
		}),

	countIngredient: protectedProcedure
		.input(
			z.object({
				ingredientId: z.number(),
				countedQuantity: z.number().min(0),
				notes: z.string().max(500).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return db.transaction(async (tx) => {
				const ingredient = await tx.query.ingredients.findFirst({
					where: and(
						eq(ingredients.id, input.ingredientId),
						eq(ingredients.user_uid, ctx.user.id),
					),
				});
				if (!ingredient) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Ingrediente no encontrado.",
					});
				}

				const varianceQuantity =
					input.countedQuantity - ingredient.stock_quantity;
				const denominator = Math.max(
					Math.abs(ingredient.stock_quantity),
					ingredient.package_size * 0.01,
					0.0001,
				);
				const variancePercent = (varianceQuantity / denominator) * 100;
				const exceedsTolerance = Math.abs(variancePercent) > TOLERANCE_PERCENT;

				const [count] = await tx
					.insert(ingredientCounts)
					.values({
						ingredient_id: input.ingredientId,
						expected_quantity: ingredient.stock_quantity,
						counted_quantity: input.countedQuantity,
						variance_quantity: varianceQuantity,
						variance_percent: variancePercent,
						exceeds_tolerance: exceedsTolerance,
						notes: input.notes,
						user_uid: ctx.user.id,
					})
					.returning();

				await tx
					.update(ingredients)
					.set({
						stock_quantity: input.countedQuantity,
						updated_at: new Date(),
					})
					.where(eq(ingredients.id, input.ingredientId));

				if (varianceQuantity !== 0) {
					await tx.insert(ingredientMovements).values({
						ingredient_id: input.ingredientId,
						movement_type: "physical_count_adjustment",
						quantity: varianceQuantity,
						expected_quantity: ingredient.stock_quantity,
						notes: input.notes,
						user_uid: ctx.user.id,
					});
				}

				return count;
			});
		}),

	saveRecipe: protectedProcedure
		.input(
			z.object({
				productId: z.number(),
				items: z
					.array(
						z.object({
							ingredientId: z.number(),
							quantity: z.number().positive(),
						}),
					)
					.min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const product = await db.query.products.findFirst({
				where: and(
					eq(products.id, input.productId),
					eq(products.user_uid, ctx.user.id),
				),
			});
			if (!product) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Producto no encontrado.",
				});
			}

			const ingredientIds = input.items.map((item) => item.ingredientId);
			const ownedIngredients = await db
				.select({ id: ingredients.id })
				.from(ingredients)
				.where(
					and(
						eq(ingredients.user_uid, ctx.user.id),
						inArray(ingredients.id, ingredientIds),
					),
				);
			if (ownedIngredients.length !== new Set(ingredientIds).size) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "La receta contiene ingredientes inválidos.",
				});
			}

			return db.transaction(async (tx) => {
				let recipe = await tx.query.recipes.findFirst({
					where: and(
						eq(recipes.product_id, input.productId),
						eq(recipes.user_uid, ctx.user.id),
					),
				});

				if (!recipe) {
					[recipe] = await tx
						.insert(recipes)
						.values({
							product_id: input.productId,
							user_uid: ctx.user.id,
						})
						.returning();
				} else {
					await tx
						.update(recipes)
						.set({ updated_at: new Date() })
						.where(eq(recipes.id, recipe.id));
					await tx
						.delete(recipeItems)
						.where(eq(recipeItems.recipe_id, recipe.id));
				}

				await tx.insert(recipeItems).values(
					input.items.map((item) => ({
						recipe_id: recipe.id,
						ingredient_id: item.ingredientId,
						quantity: item.quantity,
					})),
				);
				return { success: true };
			});
		}),

	deleteRecipe: protectedProcedure
		.input(z.object({ recipeId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const recipe = await db.query.recipes.findFirst({
				where: and(
					eq(recipes.id, input.recipeId),
					eq(recipes.user_uid, ctx.user.id),
				),
			});
			if (!recipe) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Receta no encontrada.",
				});
			}
			await db.transaction(async (tx) => {
				await tx
					.delete(recipeItems)
					.where(eq(recipeItems.recipe_id, input.recipeId));
				await tx.delete(recipes).where(eq(recipes.id, input.recipeId));
			});
			return { success: true };
		}),

	warnings: protectedProcedure.query(async ({ ctx }) => {
		const [countRows, recipeRows, soldRows, movementRows] = await Promise.all([
			db.query.ingredientCounts.findMany({
				where: eq(ingredientCounts.user_uid, ctx.user.id),
				with: { ingredient: true },
				orderBy: [desc(ingredientCounts.created_at)],
				limit: 200,
			}),
			db.query.recipes.findMany({
				where: eq(recipes.user_uid, ctx.user.id),
				with: { items: { with: { ingredient: true } } },
			}),
			db
				.select({
					orderItemId: orderItems.id,
					orderId: orders.id,
					tableName: orders.table_name,
					productId: orderItems.product_id,
					productName: products.name,
					quantity: orderItems.quantity,
					orderCreatedAt: orders.created_at,
					status: orders.status,
				})
				.from(orderItems)
				.innerJoin(orders, eq(orderItems.order_id, orders.id))
				.leftJoin(products, eq(orderItems.product_id, products.id))
				.where(eq(orders.user_uid, ctx.user.id)),
			db
				.select()
				.from(ingredientMovements)
				.where(eq(ingredientMovements.user_uid, ctx.user.id)),
		]);

		const recipesByProduct = new Map(
			recipeRows.map((recipe) => [recipe.product_id, recipe]),
		);
		const movementTotals = new Map<string, number>();
		for (const movement of movementRows) {
			if (!movement.order_item_id) continue;
			const key = `${movement.order_item_id}:${movement.ingredient_id}`;
			movementTotals.set(
				key,
				(movementTotals.get(key) ?? 0) + movement.quantity,
			);
		}

		const orderWarnings: Array<{
			orderId: number;
			tableName: string | null;
			productName: string;
			ingredientName: string;
			expectedQuantity: number;
			recordedQuantity: number;
			variancePercent: number;
			unit: string;
		}> = [];

		for (const sold of soldRows) {
			if (
				!sold.productId ||
				!["pending", "completed"].includes(sold.status ?? "")
			) {
				continue;
			}
			const recipe = recipesByProduct.get(sold.productId);
			if (
				!recipe ||
				!sold.orderCreatedAt ||
				!recipe.updated_at ||
				sold.orderCreatedAt < recipe.updated_at
			) {
				continue;
			}

			for (const component of recipe.items) {
				const expected = component.quantity * sold.quantity;
				const key = `${sold.orderItemId}:${component.ingredient_id}`;
				const recorded = Math.max(0, -(movementTotals.get(key) ?? 0));
				const variancePercent =
					expected > 0 ? ((recorded - expected) / expected) * 100 : 0;
				if (Math.abs(variancePercent) <= TOLERANCE_PERCENT) continue;

				orderWarnings.push({
					orderId: sold.orderId,
					tableName: sold.tableName,
					productName: sold.productName ?? `Producto #${sold.productId}`,
					ingredientName: component.ingredient.name,
					expectedQuantity: expected,
					recordedQuantity: recorded,
					variancePercent,
					unit: component.ingredient.unit,
				});
			}
		}

		const latestCountByIngredient = new Map<
			number,
			(typeof countRows)[number]
		>();
		for (const countRow of countRows) {
			if (!latestCountByIngredient.has(countRow.ingredient_id)) {
				latestCountByIngredient.set(countRow.ingredient_id, countRow);
			}
		}
		const countWarnings = [...latestCountByIngredient.values()]
			.filter((countRow) => countRow.exceeds_tolerance)
			.slice(0, 30);

		return {
			tolerancePercent: TOLERANCE_PERCENT,
			countWarnings,
			orderWarnings: orderWarnings.slice(0, 50),
		};
	}),
});
