import { beforeAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { appSettingsRouter } = await import("../app-settings");
const { createCallerFactory } = await import("../../init");

const caller = createCallerFactory(appSettingsRouter)({
	user: makeUser("scope::norte"),
});

beforeAll(async () => {
	// Base sin `app_settings`, como la de produccion: nunca se migro.
	await pg.exec("SELECT 1");
});

describe("appSettings on a database without the table", () => {
	it("creates the table instead of failing the whole settings screen", async () => {
		const settings = await caller.get();
		expect(settings.company_title).toBe("APOS by Blinder");
		expect(settings.primary_color).toBe("#1e3a8a");
	});

	it("saves after healing", async () => {
		const saved = await caller.update({
			company_title: "Blinder",
			primary_color: "#1e3a8a",
			accent_color: "#0ea5e9",
			background_color: "#f8fafc",
			card_color: "#ffffff",
			text_color: "#0f172a",
		});
		expect(saved.company_title).toBe("Blinder");
	});
});
