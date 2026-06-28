import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	products,
	restockAlerts,
	restockRules,
	suppliers,
} from "@/lib/db/schema";
import { sendSupplierEmail, sendSupplierSms } from "@/lib/notify";

/**
 * Revisa si el producto tiene una regla de reabasto activa y, si el stock
 * actual ya cruzó el umbral configurado, contacta de inmediato al proveedor
 * (email y/o SMS, según la regla) y deja un registro en restock_alerts.
 *
 * Se llama después de cualquier movimiento que reduzca in_stock (venta en
 * mesas, POS, órdenes). No lanza errores hacia arriba: un fallo al notificar
 * al proveedor nunca debe tumbar una venta.
 */
export async function maybeTriggerRestock(
	userId: string,
	productId: number,
): Promise<void> {
	try {
		const rule = await db.query.restockRules.findFirst({
			where: and(
				eq(restockRules.product_id, productId),
				eq(restockRules.user_uid, userId),
				eq(restockRules.is_active, true),
			),
			with: { supplier: true },
		});
		if (!rule) return;

		const product = await db.query.products.findFirst({
			where: and(eq(products.id, productId), eq(products.user_uid, userId)),
		});
		if (!product) return;

		if (product.in_stock > rule.threshold_quantity) return;

		if (rule.last_triggered_at) {
			const hoursSince =
				(Date.now() - rule.last_triggered_at.getTime()) / (1000 * 60 * 60);
			if (hoursSince < rule.cooldown_hours) return;
		}

		const supplier = rule.supplier;
		const channel =
			rule.auto_contact_email && rule.auto_contact_sms
				? "both"
				: rule.auto_contact_sms
					? "sms"
					: "email";

		let emailStatus: string | undefined;
		let smsStatus: string | undefined;
		const errors: string[] = [];

		const subject = `Reabasto urgente: ${product.name}`;
		const message =
			`Hola${supplier?.contact_name ? ` ${supplier.contact_name}` : ""},\n\n` +
			`Necesitamos reabastecer "${product.name}".\n` +
			`Existencia actual: ${product.in_stock} unidades (umbral: ${rule.threshold_quantity}).\n` +
			`Cantidad solicitada: ${rule.reorder_quantity} unidades.\n\n` +
			`Por favor confirma el pedido a la brevedad. Gracias.`;

		if (rule.auto_contact_email) {
			if (supplier?.email) {
				const result = await sendSupplierEmail({
					to: supplier.email,
					subject,
					text: message,
				});
				emailStatus = result.status;
				if (result.error) errors.push(result.error);
			} else {
				emailStatus = "skipped";
				errors.push("El proveedor no tiene email registrado");
			}
		}

		if (rule.auto_contact_sms) {
			if (supplier?.phone) {
				const result = await sendSupplierSms({
					to: supplier.phone,
					body: `${subject}. Existencia: ${product.in_stock}. Solicitado: ${rule.reorder_quantity} uds.`,
				});
				smsStatus = result.status;
				if (result.error) errors.push(result.error);
			} else {
				smsStatus = "skipped";
				errors.push("El proveedor no tiene teléfono registrado");
			}
		}

		await db.transaction(async (tx) => {
			await tx.insert(restockAlerts).values({
				user_uid: userId,
				rule_id: rule.id,
				product_id: product.id,
				supplier_id: supplier?.id,
				stock_at_trigger: product.in_stock,
				requested_quantity: rule.reorder_quantity,
				channel,
				email_status: emailStatus,
				sms_status: smsStatus,
				error_message: errors.length > 0 ? errors.join(" | ") : null,
			});
			await tx
				.update(restockRules)
				.set({ last_triggered_at: new Date() })
				.where(eq(restockRules.id, rule.id));
		});
	} catch (error) {
		// Nunca dejar que un fallo de notificación rompa la venta en curso.
		console.error("maybeTriggerRestock failed", error);
	}
}
