import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	customers,
	orderItems,
	orders,
	products,
	transactions,
} from "@/lib/db/schema";
import {
	consumeRecipeIngredients,
	restoreOrderItemIngredients,
} from "@/lib/inventory/ingredients";
import { maybeTriggerRestock } from "@/lib/restock/trigger";
import { protectedProcedure, router } from "../init";

const orderWithCustomerSchema = z.object({
	id: z.number(),
	customer_id: z.number().nullable(),
	total_amount: z.number(),
	status: z.string().nullable(),
	user_uid: z.string(),
	created_at: z.date().nullable(),
	customer: z.object({ name: z.string() }).nullable(),
});

const orderDetailSchema = z.object({
	id: z.number(),
	customer_id: z.number().nullable(),
	total_amount: z.number(),
	status: z.string().nullable(),
	user_uid: z.string(),
	created_at: z.date().nullable(),
	customer: z.object({ name: z.string() }).nullable(),
	orderItems: z.array(
		z.object({
			id: z.number(),
			product_id: z.number().nullable(),
			quantity: z.number(),
			price: z.number(),
			product: z
				.object({ name: z.string(), category: z.string().nullable() })
				.nullable(),
		}),
	),
});

export const ordersRouter = router({
	get: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/orders/{id}",
				tags: ["Orders"],
				summary: "Get order details",
			},
		})
		.input(z.object({ id: z.number() }))
		.output(orderDetailSchema.nullable())
		.query(async ({ ctx, input }) => {
			const result = await db.query.orders.findFirst({
				where: and(eq(orders.id, input.id), eq(orders.user_uid, ctx.user.id)),
				with: {
					customer: { columns: { name: true } },
					orderItems: {
						with: {
							product: { columns: { name: true, category: true } },
						},
					},
				},
			});
			return result ?? null;
		}),

	list: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/orders",
				tags: ["Orders"],
				summary: "List all orders",
			},
		})
		.input(z.void())
		.output(z.array(orderWithCustomerSchema))
		.query(async ({ ctx }) => {
			return db.query.orders.findMany({
				where: eq(orders.user_uid, ctx.user.id),
				with: {
					customer: {
						columns: { name: true },
					},
				},
			});
		}),

	create: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/orders",
				tags: ["Orders"],
				summary: "Create an order with items",
			},
		})
		.input(
			z.object({
				customerId: z.number(),
				paymentMethodId: z.number(),
				products: z.array(
					z.object({
						id: z.number(),
						quantity: z.number().int().positive(),
						price: z.number().int(),
					}),
				),
				total: z.number().int(),
			}),
		)
		.output(orderWithCustomerSchema)
		.mutation(async ({ ctx, input }) => {
			const result = await db.transaction(async (tx) => {
				const [orderData] = await tx
					.insert(orders)
					.values({
						customer_id: input.customerId,
						total_amount: input.total,
						user_uid: ctx.user.id,
						status: "completed",
					})
					.returning();

				const insertedItems = await tx
					.insert(orderItems)
					.values(
						input.products.map((product) => ({
							order_id: orderData.id,
							product_id: product.id,
							quantity: product.quantity,
							price: product.price,
						})),
					)
					.returning();

				const productIds = input.products.map((product) => product.id);
				const ownedProducts = await tx
					.select({ id: products.id, stock: products.in_stock })
					.from(products)
					.where(
						and(
							eq(products.user_uid, ctx.user.id),
							inArray(products.id, productIds),
						),
					);

				if (ownedProducts.length !== new Set(productIds).size) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "La orden contiene productos inválidos.",
					});
				}

				const recipeManagedProductIds = await consumeRecipeIngredients(
					tx,
					ctx.user.id,
					orderData.id,
					insertedItems.flatMap((item) =>
						item.product_id
							? [
									{
										orderItemId: item.id,
										productId: item.product_id,
										quantity: item.quantity,
									},
								]
							: [],
					),
				);

				for (const requested of input.products) {
					if (recipeManagedProductIds.has(requested.id)) continue;
					const product = ownedProducts.find(
						(candidate) => candidate.id === requested.id,
					);
					if (!product || product.stock < requested.quantity) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "No hay inventario suficiente para completar la orden.",
						});
					}
					await tx
						.update(products)
						.set({
							in_stock: sql`${products.in_stock} - ${requested.quantity}`,
						})
						.where(eq(products.id, requested.id));
				}

				await tx.insert(transactions).values({
					order_id: orderData.id,
					payment_method_id: input.paymentMethodId,
					amount: input.total,
					user_uid: ctx.user.id,
					status: "completed",
					category: "selling",
					type: "income",
					description: `Payment for order #${orderData.id}`,
				});

				const customer = input.customerId
					? await tx.query.customers.findFirst({
							where: eq(customers.id, input.customerId),
							columns: { name: true },
						})
					: null;

				return { ...orderData, customer: customer ?? null };
			});

			// Revisar reglas de reabasto fuera de la transacción: un fallo al
			// contactar al proveedor nunca debe revertir la venta.
			for (const product of input.products) {
				await maybeTriggerRestock(ctx.user.id, product.id);
			}
			return result;
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/orders/{id}",
				tags: ["Orders"],
				summary: "Update an order",
			},
		})
		.input(
			z.object({
				id: z.number(),
				total_amount: z.number().int().optional(),
				status: z.enum(["completed", "pending", "cancelled"]).optional(),
			}),
		)
		.output(orderWithCustomerSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const reactivatedProductIds = new Set<number>();
			const result = await db.transaction(async (tx) => {
				const current = await tx.query.orders.findFirst({
					where: and(eq(orders.id, id), eq(orders.user_uid, ctx.user.id)),
					with: { orderItems: true },
				});
				if (!current) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Orden no encontrada.",
					});
				}

				if (input.status === "cancelled" && current.status !== "cancelled") {
					for (const item of current.orderItems) {
						const recipeManaged = await restoreOrderItemIngredients(
							tx,
							ctx.user.id,
							current.id,
							item.id,
							"Orden cancelada",
						);
						if (item.product_id && !recipeManaged) {
							await tx
								.update(products)
								.set({
									in_stock: sql`${products.in_stock} + ${item.quantity}`,
								})
								.where(eq(products.id, item.product_id));
						}
					}
				}

				if (
					input.status &&
					input.status !== "cancelled" &&
					current.status === "cancelled"
				) {
					const recipeManagedProductIds = await consumeRecipeIngredients(
						tx,
						ctx.user.id,
						current.id,
						current.orderItems.flatMap((item) =>
							item.product_id
								? [
										{
											orderItemId: item.id,
											productId: item.product_id,
											quantity: item.quantity,
										},
									]
								: [],
						),
					);

					for (const item of current.orderItems) {
						if (!item.product_id) continue;
						if (recipeManagedProductIds.has(item.product_id)) continue;
						const product = await tx.query.products.findFirst({
							where: and(
								eq(products.id, item.product_id),
								eq(products.user_uid, ctx.user.id),
							),
						});
						if (!product || product.in_stock < item.quantity) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"No hay inventario suficiente para reactivar la orden.",
							});
						}
						await tx
							.update(products)
							.set({
								in_stock: sql`${products.in_stock} - ${item.quantity}`,
							})
							.where(eq(products.id, item.product_id));
						reactivatedProductIds.add(item.product_id);
					}
				}

				const [updated] = await tx
					.update(orders)
					.set({ ...data, user_uid: ctx.user.id })
					.where(and(eq(orders.id, id), eq(orders.user_uid, ctx.user.id)))
					.returning();

				const customer = updated.customer_id
					? await tx.query.customers.findFirst({
							where: eq(customers.id, updated.customer_id),
							columns: { name: true },
						})
					: null;

				return { ...updated, customer: customer ?? null };
			});

			for (const productId of reactivatedProductIds) {
				await maybeTriggerRestock(ctx.user.id, productId);
			}
			return result;
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/orders/{id}",
				tags: ["Orders"],
				summary: "Delete an order and its items",
			},
		})
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await db.transaction(async (tx) => {
				const order = await tx.query.orders.findFirst({
					where: and(eq(orders.id, input.id), eq(orders.user_uid, ctx.user.id)),
					with: { orderItems: true },
				});
				if (!order) return;

				for (const item of order.orderItems) {
					const recipeManaged = await restoreOrderItemIngredients(
						tx,
						ctx.user.id,
						order.id,
						item.id,
						"Orden eliminada",
					);
					if (
						item.product_id &&
						order.status !== "cancelled" &&
						!recipeManaged
					) {
						await tx
							.update(products)
							.set({
								in_stock: sql`${products.in_stock} + ${item.quantity}`,
							})
							.where(eq(products.id, item.product_id));
					}
				}
				await tx.delete(orderItems).where(eq(orderItems.order_id, input.id));
				await tx
					.delete(orders)
					.where(
						and(eq(orders.id, input.id), eq(orders.user_uid, ctx.user.id)),
					);
			});
			return { success: true };
		}),
});
