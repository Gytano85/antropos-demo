/**
 * Envío real de notificaciones a proveedores (email + SMS) usando fetch
 * directo a las APIs de Resend y Twilio. No se agregan dependencias nuevas.
 *
 * Las credenciales se leen de variables de entorno; si no están configuradas,
 * las funciones devuelven `skipped` en vez de fallar, para que el resto de la
 * app (y el seed/demo) funcione sin necesidad de tener cuentas en Resend o
 * Twilio.
 *
 * Variables de entorno esperadas:
 * - RESEND_API_KEY: clave de https://resend.com
 * - RESEND_FROM_EMAIL: remitente verificado en Resend (ej. pedidos@tu-dominio.com)
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: credenciales de https://twilio.com
 * - TWILIO_FROM_NUMBER: número de Twilio en formato E.164 (+15551234567)
 *
 * Nota: en cuentas de prueba (trial) de Twilio, los SMS solo pueden enviarse
 * a números verificados manualmente en el panel de Twilio.
 */

export type NotifyResult = {
	status: "sent" | "failed" | "skipped";
	error?: string;
};

export async function sendSupplierEmail(params: {
	to: string;
	subject: string;
	text: string;
}): Promise<NotifyResult> {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;

	if (!apiKey || !from) {
		return { status: "skipped", error: "RESEND_API_KEY o RESEND_FROM_EMAIL no configurados" };
	}

	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [params.to],
				subject: params.subject,
				text: params.text,
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			return { status: "failed", error: `Resend ${response.status}: ${body.slice(0, 300)}` };
		}
		return { status: "sent" };
	} catch (error) {
		return {
			status: "failed",
			error: error instanceof Error ? error.message : "Error desconocido al enviar email",
		};
	}
}

export async function sendSupplierSms(params: {
	to: string;
	body: string;
}): Promise<NotifyResult> {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const from = process.env.TWILIO_FROM_NUMBER;

	if (!accountSid || !authToken || !from) {
		return {
			status: "skipped",
			error: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_FROM_NUMBER no configurados",
		};
	}

	try {
		const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
		const response = await fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
			{
				method: "POST",
				headers: {
					Authorization: `Basic ${credentials}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					To: params.to,
					From: from,
					Body: params.body,
				}),
			},
		);

		if (!response.ok) {
			const body = await response.text();
			return { status: "failed", error: `Twilio ${response.status}: ${body.slice(0, 300)}` };
		}
		return { status: "sent" };
	} catch (error) {
		return {
			status: "failed",
			error: error instanceof Error ? error.message : "Error desconocido al enviar SMS",
		};
	}
}
