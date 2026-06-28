import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { products, restockAlerts, restockRules } from "@/lib/db/schema";
import { maybeTriggerRestock } from "@/lib/restock/trigger";
import { protectedProcedure, router } from "../init";

const ruleInput = z.object({
	productId: z.number(),
	supplierId: z.number().nullable(),
	thresholdQuantity: z.number().int().min(0).max(100000),
	reorderQuantity: z.number().int().min(1).max(100000),
	autoContactEmail: z.boolean(),
	autoContactSms: z.boolean(),
	isActive: z.boolean(),
	cooldownHours: z.number().int().min(1).max(720),
});

export const restockRulesRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return db.query.restockRules.findMany({
			where: eq(restockRules.user_uid, ctx.user.id),
			with: { product: true, supplier: true },
			orderBy: (table, { asc }) => [asc(table.id)],
		});
	}),

	create: protectedProcedure
		.input(ruleInput)
		.mutation(async ({ ctx, input }) => {
			const product = await db.query.products.findFirst({
				where: and(
					eq(products.id, input.productId),
					eq(products.user_uid, ctx.user.id),
				),
			});
			if (!product) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado." });
			}

			const [created] = await db
				.insert(restockRules)
				.values({
					user_uid: ctx.user.id,
					product_id: input.productId,
					supplier_id: input.supplierId,
					threshold_quantity: input.thresholdQuantity,
					reorder_quantity: input.reorderQuantity,
					auto_contact_email: input.autoContactEmail,
					auto_contact_sms: input.autoContactSms,
					is_active: input.isActive,
					cooldown_hours: input.cooldownHours,
				})
				.returning();

			// Si ya está por debajo del umbral en este momento, contactar de inmediato.
			await maybeTriggerRestock(ctx.user.id, input.productId);
			return created;
		}),

	update: protectedProcedure
		.input(ruleInput.extend({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(restockRules)
				.set({
					supplier_id: input.supplierId,
					threshold_quantity: input.thresholdQuantity,
					reorder_quantity: input.reorderQuantity,
					auto_contact_email: input.autoContactEmail,
					auto_contact_sms: input.autoContactSms,
					is_active: input.isActive,
					cooldown_hours: input.cooldownHours,
					updated_at: new Date(),
				})
				.where(
					and(
						eq(restockRules.id, input.id),
						eq(restockRules.user_uid, ctx.user.id),
					),
				)
				.returning();
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Regla no encontrada." });
			}
			await maybeTriggerRestock(ctx.user.id, updated.product_id);
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(restockRules)
				.where(
					and(
						eq(restockRules.id, input.id),
						eq(restockRules.user_uid, ctx.user.id),
					),
				);
			return { success: true };
		}),

	/** Fuerza la revisión/contacto inmediato, ignorando el cooldown (botón "Contactar ahora"). */
	triggerNow: protectedProcedure
		.input(z.object({ ruleId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const rule = await db.query.restockRules.findFirst({
				where: and(
					eq(restockRules.id, input.ruleId),
					eq(restockRules.user_uid, ctx.user.id),
				),
			});
			if (!rule) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Regla no encontrada." });
			}
			// Reseteamos el cooldown para forzar el envío inmediato.
			await db
				.update(restockRules)
				.set({ last_triggered_at: null })
				.where(eq(restockRules.id, rule.id));
			await maybeTriggerRestock(ctx.user.id, rule.product_id);
			return { success: true };
		}),

	alerts: protectedProcedure.query(async ({ ctx }) => {
		return db.query.restockAlerts.findMany({
			where: eq(restockAlerts.user_uid, ctx.user.id),
			with: { product: true, supplier: true },
			orderBy: [desc(restockAlerts.created_at)],
			limit: 50,
		});
	}),
});
