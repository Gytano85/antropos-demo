import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { paymentMethods } from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const paymentMethodSchema = z.object({
	id: z.number(),
	name: z.string(),
	user_uid: z.string().nullable(),
	created_at: z.date().nullable(),
});

/**
 * Filas visibles para una cuenta: las suyas y el catalogo heredado, que son las
 * creadas antes de que la tabla tuviera dueño. Las heredadas se listan pero no
 * se pueden modificar ni borrar: las transacciones de otras cuentas las
 * referencian y borrarlas rompia sus registros.
 */
const visibleTo = (uid: string) =>
	or(eq(paymentMethods.user_uid, uid), isNull(paymentMethods.user_uid));

/** Solo lo propio es modificable. */
const ownedBy = (uid: string) => eq(paymentMethods.user_uid, uid);

export const paymentMethodsRouter = router({
	list: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/payment-methods",
				tags: ["Payment Methods"],
				summary: "List all payment methods",
			},
		})
		.input(z.void())
		.output(z.array(paymentMethodSchema))
		.query(async ({ ctx }) => {
			return db.select().from(paymentMethods).where(visibleTo(ctx.user.id));
		}),

	create: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/payment-methods",
				tags: ["Payment Methods"],
				summary: "Create a payment method",
			},
		})
		.input(z.object({ name: z.string().min(1) }))
		.output(paymentMethodSchema)
		.mutation(async ({ ctx, input }) => {
			const [data] = await db
				.insert(paymentMethods)
				.values({ name: input.name.trim(), user_uid: ctx.user.id })
				.returning();
			return data;
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/payment-methods/{id}",
				tags: ["Payment Methods"],
				summary: "Update a payment method",
			},
		})
		.input(z.object({ id: z.number(), name: z.string().min(1) }))
		.output(paymentMethodSchema)
		.mutation(async ({ ctx, input }) => {
			const [data] = await db
				.update(paymentMethods)
				.set({ name: input.name.trim() })
				.where(and(eq(paymentMethods.id, input.id), ownedBy(ctx.user.id)))
				.returning();
			if (!data) throw new Error("Método de pago no encontrado");
			return data;
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/payment-methods/{id}",
				tags: ["Payment Methods"],
				summary: "Delete a payment method",
			},
		})
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			// Borrar es idempotente por contrato, asi que no distinguimos "ya no
			// existe" de "no es tuyo". Lo que protege es el filtro por dueño: la fila
			// ajena no se toca.
			await db
				.delete(paymentMethods)
				.where(and(eq(paymentMethods.id, input.id), ownedBy(ctx.user.id)));
			return { success: true };
		}),
});
