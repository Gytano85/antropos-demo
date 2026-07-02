import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	orderItems,
	orders,
	paymentMethods,
	products,
	transactions,
} from "@/lib/db/schema";
import {
	consumeRecipeIngredients,
	restoreOrderItemIngredients,
} from "@/lib/inventory/ingredients";
import {
	computeAlcoholPrice,
	isAlcoholCategory,
} from "@/lib/pricing/dynamic-pricing";
import {
	getOrCreatePricingSettings,
	toSettingsValues,
} from "@/lib/pricing/settings";
import { protectedProcedure, router } from "../init";

const tableOrderSchema = z.object({
	id: z.number(),
	table_name: z.string().nullable(),
	total_amount: z.number(),
	status: z.string().nullable(),
	created_at: z.date().nullable(),
	closed_at: z.date().nullable(),
	party_size: z.number(),
	orderItems: z.array(
		z.object({
			id: z.number(),
			product_id: z.number().nullable(),
			quantity: z.number(),
			price: z.number(),
			product: z
				.object({
					name: z.string(),
					category: z.string().nullable(),
				})
				.nullable(),
		}),
	),
});

async function getOpenTable(userId: string, orderId: number) {
	const order = await db.query.orders.findFirst({
		where: and(
			eq(orders.id, orderId),
			eq(orders.user_uid, userId),
			eq(orders.status, "pending"),
			isNotNull(orders.table_name),
		),
		with: {
			orderItems: {
				with: {
					product: {
						columns: { name: true, category: true },
					},
				},
			},
		},
	});

	if (!order) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "La comanda no existe o ya fue cerrada.",
		});
	}

	return order;
}

export const tablesRouter = router({
	listOpen: protectedProcedure
		.output(z.array(tableOrderSchema))
		.query(async ({ ctx }) => {
			return db.query.orders.findMany({
				where: and(
					eq(orders.user_uid, ctx.user.id),
					eq(orders.status, "pending"),
					isNotNull(orders.table_name),
				),
				with: {
					orderItems: {
						with: {
							product: {
								columns: { name: true, category: true },
							},
						},
					},
				},
			});
		}),

	open: protectedProcedure
		.input(
			z.object({
				tableName: z.string().trim().min(1).max(50),
				partySize: z.number().int().min(1).max(999).default(1),
			}),
		)
		.output(tableOrderSchema)
		.mutation(async ({ ctx, input }) => {
			const duplicate = await db.query.orders.findFirst({
				where: and(
					eq(orders.user_uid, ctx.user.id),
					eq(orders.status, "pending"),
					eq(orders.table_name, input.tableName),
				),
			});

			if (duplicate) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Esta mesa ya tiene una comanda abierta.",
				});
			}

			const [order] = await db
				.insert(orders)
				.values({
					table_name: input.tableName,
					total_amount: 0,
					user_uid: ctx.user.id,
					status: "pending",
					party_size: input.partySize,
				})
				.returning();

			return { ...order, orderItems: [] };
		}),

	setPartySize: protectedProcedure
		.input(
			z.object({
				orderId: z.number(),
				partySize: z.number().int().min(1).max(999),
			}),
		)
		.output(tableOrderSchema)
		.mutation(async ({ ctx, input }) => {
			await getOpenTable(ctx.user.id, input.orderId);

			await db
				.update(orders)
				.set({ party_size: input.partySize })
				.where(eq(orders.id, input.orderId));

			const updated = await db.query.orders.findFirst({
				where: eq(orders.id, input.orderId),
				with: {
					orderItems: {
						with: {
							product: {
								columns: { name: true, category: true },
							},
						},
					},
				},
			});

			if (!updated) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "No se pudo actualizar la comanda.",
				});
			}
			return updated;
		}),

	addItem: protectedProcedure
		.input(
			z.object({
				orderId: z.number(),
				productId: z.number(),
				quantity: z.number().int().positive().default(1),
			}),
		)
		.output(tableOrderSchema)
		.mutation(async ({ ctx, input }) => {
			const openTable = await getOpenTable(ctx.user.id, input.orderId);

			// Se calcula fuera de la transacción para no anidar consultas con el
			// `db` global mientras una transacción `tx` está abierta (PGLite usa
			// una sola conexión embebida y eso puede provocar un bloqueo mutuo).
			const settingsRow = await getOrCreatePricingSettings(ctx.user.id);
			const settings = toSettingsValues(settingsRow);
			const [openTablesRows] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(orders)
				.where(
					and(
						eq(orders.user_uid, ctx.user.id),
						eq(orders.status, "pending"),
						isNotNull(orders.table_name),
					),
				);
			const openTablesCount = Number(openTablesRows?.count ?? 0);

			return db.transaction(async (tx) => {
				const product = await tx.query.products.findFirst({
					where: and(
						eq(products.id, input.productId),
						eq(products.user_uid, ctx.user.id),
					),
				});

				if (!product) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "El producto no existe.",
					});
				}

				let unitPrice = product.price;

				if (isAlcoholCategory(product.category)) {
					const existingAlcoholUnits = openTable.orderItems
						.filter((item) => isAlcoholCategory(item.product?.category))
						.reduce((sum, item) => sum + item.quantity, 0);

					const result = computeAlcoholPrice(product.price, {
						openTables: openTablesCount,
						alcoholUnitsForParty: existingAlcoholUnits + input.quantity,
						partySize: openTable.party_size,
						settings,
					});

					unitPrice = result.price;
				}

				const existing = await tx.query.orderItems.findFirst({
					where: and(
						eq(orderItems.order_id, input.orderId),
						eq(orderItems.product_id, input.productId),
					),
				});

				let amountDelta: number;

				let orderItemId: number;
				if (existing) {
					const previousLineTotal = existing.price * existing.quantity;
					const newQuantity = existing.quantity + input.quantity;
					const newLineTotal = unitPrice * newQuantity;
					amountDelta = newLineTotal - previousLineTotal;

					await tx
						.update(orderItems)
						.set({ quantity: newQuantity, price: unitPrice })
						.where(eq(orderItems.id, existing.id));
					orderItemId = existing.id;
				} else {
					amountDelta = unitPrice * input.quantity;
					const [inserted] = await tx
						.insert(orderItems)
						.values({
							order_id: input.orderId,
							product_id: input.productId,
							quantity: input.quantity,
							price: unitPrice,
						})
						.returning();
					orderItemId = inserted.id;
				}

				const recipeManagedProductIds = await consumeRecipeIngredients(
					tx,
					ctx.user.id,
					input.orderId,
					[
						{
							orderItemId,
							productId: input.productId,
							quantity: input.quantity,
						},
					],
				);

				if (!recipeManagedProductIds.has(input.productId)) {
					if (product.in_stock < input.quantity) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "No hay inventario suficiente para este producto.",
						});
					}
					await tx
						.update(products)
						.set({ in_stock: sql`${products.in_stock} - ${input.quantity}` })
						.where(eq(products.id, input.productId));
				}

				await tx
					.update(orders)
					.set({
						total_amount: sql`${orders.total_amount} + ${amountDelta}`,
					})
					.where(eq(orders.id, input.orderId));

				const updated = await tx.query.orders.findFirst({
					where: eq(orders.id, input.orderId),
					with: {
						orderItems: {
							with: {
								product: {
									columns: { name: true, category: true },
								},
							},
						},
					},
				});

				if (!updated) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "No se pudo actualizar la comanda.",
					});
				}
				return updated;
			});
		}),

	removeItem: protectedProcedure
		.input(z.object({ orderId: z.number(), itemId: z.number() }))
		.output(tableOrderSchema)
		.mutation(async ({ ctx, input }) => {
			await getOpenTable(ctx.user.id, input.orderId);

			return db.transaction(async (tx) => {
				const item = await tx.query.orderItems.findFirst({
					where: and(
						eq(orderItems.id, input.itemId),
						eq(orderItems.order_id, input.orderId),
					),
				});

				if (!item) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Producto no encontrado.",
					});
				}

				const recipeManaged = await restoreOrderItemIngredients(
					tx,
					ctx.user.id,
					input.orderId,
					item.id,
					"Producto retirado de la comanda",
				);
				await tx.delete(orderItems).where(eq(orderItems.id, item.id));

				if (item.product_id && !recipeManaged) {
					await tx
						.update(products)
						.set({ in_stock: sql`${products.in_stock} + ${item.quantity}` })
						.where(eq(products.id, item.product_id));
				}

				await tx
					.update(orders)
					.set({
						total_amount: sql`${orders.total_amount} - ${item.price * item.quantity}`,
					})
					.where(eq(orders.id, input.orderId));

				const updated = await tx.query.orders.findFirst({
					where: eq(orders.id, input.orderId),
					with: {
						orderItems: {
							with: {
								product: {
									columns: { name: true, category: true },
								},
							},
						},
					},
				});

				if (!updated) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "No se pudo actualizar la comanda.",
					});
				}
				return updated;
			});
		}),

	decrementItem: protectedProcedure
		.input(z.object({ orderId: z.number(), itemId: z.number() }))
		.output(tableOrderSchema)
		.mutation(async ({ ctx, input }) => {
			await getOpenTable(ctx.user.id, input.orderId);

			return db.transaction(async (tx) => {
				const item = await tx.query.orderItems.findFirst({
					where: and(
						eq(orderItems.id, input.itemId),
						eq(orderItems.order_id, input.orderId),
					),
				});

				if (!item || !item.product_id) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Producto no encontrado.",
					});
				}

				if (item.quantity <= 1) {
					const recipeManaged = await restoreOrderItemIngredients(
						tx,
						ctx.user.id,
						input.orderId,
						item.id,
						"Unidad retirada de la comanda",
					);
					await tx.delete(orderItems).where(eq(orderItems.id, item.id));

					if (!recipeManaged) {
						await tx
							.update(products)
							.set({ in_stock: sql`${products.in_stock} + 1` })
							.where(eq(products.id, item.product_id));
					}
				} else {
					await tx
						.update(orderItems)
						.set({ quantity: item.quantity - 1 })
						.where(eq(orderItems.id, item.id));

					const recipeManagedProductIds = await consumeRecipeIngredients(
						tx,
						ctx.user.id,
						input.orderId,
						[
							{
								orderItemId: item.id,
								productId: item.product_id,
								quantity: -1,
							},
						],
					);

					if (!recipeManagedProductIds.has(item.product_id)) {
						await tx
							.update(products)
							.set({ in_stock: sql`${products.in_stock} + 1` })
							.where(eq(products.id, item.product_id));
					}
				}

				await tx
					.update(orders)
					.set({
						total_amount: sql`${orders.total_amount} - ${item.price}`,
					})
					.where(eq(orders.id, input.orderId));

				const updated = await tx.query.orders.findFirst({
					where: eq(orders.id, input.orderId),
					with: {
						orderItems: {
							with: {
								product: {
									columns: { name: true, category: true },
								},
							},
						},
					},
				});

				if (!updated) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "No se pudo actualizar la comanda.",
					});
				}
				return updated;
			});
		}),

	close: protectedProcedure
		.input(z.object({ orderId: z.number(), paymentMethodId: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const order = await getOpenTable(ctx.user.id, input.orderId);

			if (order.orderItems.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Agrega al menos un producto antes de cerrar la mesa.",
				});
			}

			const method = await db.query.paymentMethods.findFirst({
				where: eq(paymentMethods.id, input.paymentMethodId),
			});
			if (!method) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Selecciona un método de pago válido.",
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(orders)
					.set({ status: "completed", closed_at: new Date() })
					.where(
						and(eq(orders.id, input.orderId), eq(orders.user_uid, ctx.user.id)),
					);

				await tx.insert(transactions).values({
					order_id: input.orderId,
					payment_method_id: input.paymentMethodId,
					amount: order.total_amount,
					user_uid: ctx.user.id,
					status: "completed",
					category: "selling",
					type: "income",
					description: `Cierre de ${order.table_name ?? `comanda #${order.id}`}`,
				});
			});

			return { success: true };
		}),
});
