import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const hexColor = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Color inválido. Usa formato #RRGGBB.");

const appSettingsSchema = z.object({
	id: z.number(),
	user_uid: z.string(),
	company_title: z.string(),
	primary_color: z.string(),
	accent_color: z.string(),
	background_color: z.string(),
	card_color: z.string(),
	text_color: z.string(),
	created_at: z.date().nullable(),
	updated_at: z.date().nullable(),
});

const settingsInputSchema = z.object({
	company_title: z.string().min(1).max(120),
	primary_color: hexColor,
	accent_color: hexColor,
	background_color: hexColor,
	card_color: hexColor,
	text_color: hexColor,
});

let schemaReady: Promise<void> | null = null;

/**
 * Crea la tabla si la base no la tiene.
 *
 * El despliegue no ejecuta migraciones, asi que una base creada antes de que
 * existiera `app_settings` deja toda la pantalla de configuracion inservible:
 * la consulta falla y el error se propaga tal cual a la interfaz. El mismo
 * patron ya se usa para las tablas de camaras y de sucursales.
 */
function ensureAppSettingsSchema() {
	schemaReady ??= (async () => {
		await db.execute(
			sql.raw(`CREATE TABLE IF NOT EXISTS app_settings (
				id serial PRIMARY KEY,
				user_uid varchar(255) NOT NULL UNIQUE,
				company_title varchar(120) NOT NULL DEFAULT '${DEFAULT_COMPANY_TITLE}',
				primary_color varchar(20) NOT NULL DEFAULT '${DEFAULT_PALETTE.primary_color}',
				accent_color varchar(20) NOT NULL DEFAULT '${DEFAULT_PALETTE.accent_color}',
				background_color varchar(20) NOT NULL DEFAULT '${DEFAULT_PALETTE.background_color}',
				card_color varchar(20) NOT NULL DEFAULT '${DEFAULT_PALETTE.card_color}',
				text_color varchar(20) NOT NULL DEFAULT '${DEFAULT_PALETTE.text_color}',
				created_at timestamp DEFAULT now(),
				updated_at timestamp DEFAULT now()
			)`),
		);
	})().catch((error) => {
		schemaReady = null;
		throw error;
	});
	return schemaReady;
}

/** Identidad por defecto del sistema, en un solo sitio para no desincronizarla. */
export const DEFAULT_COMPANY_TITLE = "APOS by Blinder";

/** Paleta "Azul ejecutivo". */
export const DEFAULT_PALETTE = {
	primary_color: "#1e3a8a",
	accent_color: "#0ea5e9",
	background_color: "#f8fafc",
	card_color: "#ffffff",
	text_color: "#0f172a",
} as const;

const defaultSettings = (userId: string) => ({
	user_uid: userId,
	company_title: DEFAULT_COMPANY_TITLE,
	...DEFAULT_PALETTE,
});

export const appSettingsRouter = router({
	get: protectedProcedure
		.input(z.void())
		.output(appSettingsSchema)
		.query(async ({ ctx }) => {
			await ensureAppSettingsSchema();
			const existing = await db.query.appSettings.findFirst({
				where: eq(appSettings.user_uid, ctx.user.id),
			});

			if (existing) return existing;

			const [created] = await db
				.insert(appSettings)
				.values(defaultSettings(ctx.user.id))
				.returning();

			return created;
		}),

	update: protectedProcedure
		.input(settingsInputSchema)
		.output(appSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			await ensureAppSettingsSchema();
			const existing = await db.query.appSettings.findFirst({
				where: eq(appSettings.user_uid, ctx.user.id),
			});

			if (!existing) {
				const [created] = await db
					.insert(appSettings)
					.values({
						...defaultSettings(ctx.user.id),
						...input,
					})
					.returning();
				return created;
			}

			const [updated] = await db
				.update(appSettings)
				.set({ ...input, updated_at: new Date() })
				.where(eq(appSettings.user_uid, ctx.user.id))
				.returning();

			return updated;
		}),
});
