import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { brandingSettings } from "@/lib/db/schema";
import { getOrCreateBrandingSettings, toBrandingValues } from "@/lib/branding/settings";
import { protectedProcedure, router } from "../init";

const settingsSchema = z.object({
	companyName: z.string().trim().min(1).max(100),
	primaryColor: z
		.string()
		.trim()
		.regex(/^#[0-9a-fA-F]{6}$/, "Usa un color hex válido, ej. #0f172a"),
});

export const brandingRouter = router({
	getSettings: protectedProcedure.output(settingsSchema).query(async ({ ctx }) => {
		const row = await getOrCreateBrandingSettings(ctx.user.id);
		return toBrandingValues(row);
	}),

	updateSettings: protectedProcedure
		.input(settingsSchema)
		.output(settingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getOrCreateBrandingSettings(ctx.user.id);
			const [updated] = await db
				.update(brandingSettings)
				.set({
					company_name: input.companyName,
					primary_color: input.primaryColor,
					updated_at: new Date(),
				})
				.where(eq(brandingSettings.user_uid, ctx.user.id))
				.returning();
			return toBrandingValues(updated);
		}),
});
