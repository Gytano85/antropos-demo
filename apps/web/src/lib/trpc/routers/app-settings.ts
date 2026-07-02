import { eq } from "drizzle-orm";
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

const defaultSettings = (userId: string) => ({
	user_uid: userId,
	company_title: "Antro POS",
	primary_color: "#111827",
	accent_color: "#f3f4f6",
	background_color: "#ffffff",
	card_color: "#ffffff",
	text_color: "#111827",
});

export const appSettingsRouter = router({
	get: protectedProcedure
		.input(z.void())
		.output(appSettingsSchema)
		.query(async ({ ctx }) => {
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
