import { and, eq, isNull, or, sql } from "drizzle-orm";
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

let schemaReady: Promise<void> | null = null;

/**
 * Anade la columna de propietario si la base viene de antes de que existiera.
 *
 * El despliegue de demostracion arranca desde una copia de base empaquetada en
 * el repo y no ejecuta migraciones, asi que una copia vieja dejaba la tabla sin
 * `user_uid`. Toda consulta que la nombrara fallaba, y como en Postgres un error
 * aborta la transaccion, arrastraba tambien a las siguientes: la pantalla de
 * configuracion reventaba entera por esto.
 */
function ensurePaymentMethodsSchema() {
	schemaReady ??= (async () => {
		await db.execute(
			sql.raw(
				"ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS user_uid varchar(255)",
			),
		);
		await db.execute(
			sql.raw(
				"CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_owner_name_idx ON payment_methods (user_uid, name)",
			),
		);
		// El nombre era unico a nivel global; con dueño esa restriccion impide que
		// dos sucursales usen "Efectivo". El nombre de la restriccion depende de
		// como se creo la tabla: Postgres la llama `_key` y drizzle `_unique`.
		for (const constraint of [
			"payment_methods_name_key",
			"payment_methods_name_unique",
		]) {
			await db.execute(
				sql.raw(
					`ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS ${constraint}`,
				),
			);
		}
	})().catch((error) => {
		schemaReady = null;
		throw error;
	});
	return schemaReady;
}

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
			await ensurePaymentMethodsSchema();
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
			await ensurePaymentMethodsSchema();
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
			await ensurePaymentMethodsSchema();
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
			await ensurePaymentMethodsSchema();
			// Borrar es idempotente por contrato, asi que no distinguimos "ya no
			// existe" de "no es tuyo". Lo que protege es el filtro por dueño: la fila
			// ajena no se toca.
			await db
				.delete(paymentMethods)
				.where(and(eq(paymentMethods.id, input.id), ownedBy(ctx.user.id)));
			return { success: true };
		}),
});
