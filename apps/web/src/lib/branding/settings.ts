import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandingSettings } from "@/lib/db/schema";

type BrandingRow = typeof brandingSettings.$inferSelect;

const DEFAULTS = {
	companyName: "FinOpenPOS",
	primaryColor: "#0f172a",
};

/**
 * Devuelve la personalización visual (nombre de empresa + color primario)
 * del usuario, creándola con valores por defecto si todavía no existe.
 */
export async function getOrCreateBrandingSettings(
	userId: string,
): Promise<BrandingRow> {
	const existing = await db.query.brandingSettings.findFirst({
		where: eq(brandingSettings.user_uid, userId),
	});
	if (existing) return existing;

	const [created] = await db
		.insert(brandingSettings)
		.values({
			user_uid: userId,
			company_name: DEFAULTS.companyName,
			primary_color: DEFAULTS.primaryColor,
		})
		.onConflictDoNothing({ target: brandingSettings.user_uid })
		.returning();

	if (created) return created;

	const row = await db.query.brandingSettings.findFirst({
		where: eq(brandingSettings.user_uid, userId),
	});
	if (!row) {
		throw new Error("No se pudo crear la configuración de marca.");
	}
	return row;
}

export function toBrandingValues(row: BrandingRow) {
	return {
		companyName: row.company_name,
		primaryColor: row.primary_color,
	};
}
