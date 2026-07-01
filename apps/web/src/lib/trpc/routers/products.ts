import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const productSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string().nullable(),
	price: z.number(),
	in_stock: z.number(),
	category: z.string().nullable(),
	image_url: z.string().nullable(),
	user_uid: z.string(),
	ncm: z.string().nullable(),
	cfop: z.string().nullable(),
	icms_cst: z.string().nullable(),
	pis_cst: z.string().nullable(),
	cofins_cst: z.string().nullable(),
	unit_of_measure: z.string().nullable(),
	created_at: z.date().nullable(),
});

export const productsRouter = router({
	list: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/products",
				tags: ["Products"],
				summary: "List all products",
			},
		})
		.input(z.void())
		.output(z.array(productSchema))
		.query(async ({ ctx }) => {
			const rows = await db.query.products.findMany({
				where: eq(products.user_uid, ctx.user.id),
				with: {
					recipes: {
						where: (recipe, { eq: equals }) =>
							equals(recipe.user_uid, ctx.user.id),
						with: {
							items: {
								with: {
									ingredient: true,
								},
							},
						},
					},
				},
			});

			return rows.map(({ recipes: productRecipes, ...product }) => {
				const recipe = productRecipes[0];
				if (!recipe || recipe.items.length === 0) return product;

				const possibleServings = Math.max(
					0,
					Math.floor(
						Math.min(
							...recipe.items.map((item) =>
								item.quantity > 0
									? item.ingredient.stock_quantity / item.quantity
									: 0,
							),
						),
					),
				);

				return { ...product, in_stock: possibleServings };
			});
		}),

	create: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/products",
				tags: ["Products"],
				summary: "Create a product",
			},
		})
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
				price: z.number().int(),
				in_stock: z.number().int().min(0),
				category: z.string().optional(),
				image_url: z
					.string()
					.trim()
					.max(500)
					.optional()
					.or(z.literal("")),
				ncm: z.string().max(8).optional(),
				cfop: z.string().max(4).optional(),
				icms_cst: z.string().max(3).optional(),
				pis_cst: z.string().max(2).optional(),
				cofins_cst: z.string().max(2).optional(),
				unit_of_measure: z.string().max(6).optional(),
			}),
		)
		.output(productSchema)
		.mutation(async ({ ctx, input }) => {
			const [data] = await db
				.insert(products)
				.values({
					...input,
					image_url: input.image_url || null,
					user_uid: ctx.user.id,
				})
				.returning();
			return data;
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/products/{id}",
				tags: ["Products"],
				summary: "Update a product",
			},
		})
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				description: z.string().optional(),
				price: z.number().int().optional(),
				in_stock: z.number().int().min(0).optional(),
				category: z.string().optional(),
				image_url: z
					.string()
					.trim()
					.max(500)
					.optional()
					.or(z.literal("")),
				ncm: z.string().max(8).optional(),
				cfop: z.string().max(4).optional(),
				icms_cst: z.string().max(3).optional(),
				pis_cst: z.string().max(2).optional(),
				cofins_cst: z.string().max(2).optional(),
				unit_of_measure: z.string().max(6).optional(),
			}),
		)
		.output(productSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, image_url, ...data } = input;
			const [updated] = await db
				.update(products)
				.set({
					...data,
					...(image_url !== undefined ? { image_url: image_url || null } : {}),
					user_uid: ctx.user.id,
				})
				.where(and(eq(products.id, id), eq(products.user_uid, ctx.user.id)))
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/products/{id}",
				tags: ["Products"],
				summary: "Delete a product",
			},
		})
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(products)
				.where(
					and(eq(products.id, input.id), eq(products.user_uid, ctx.user.id)),
				);
			return { success: true };
		}),
});
