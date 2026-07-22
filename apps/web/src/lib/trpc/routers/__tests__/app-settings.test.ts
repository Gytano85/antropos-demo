import { beforeAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser, SCHEMA_DDL } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { appSettingsRouter } = await import("../app-settings");
const { createCallerFactory } = await import("../../init");

const callerAs = (uid: string) =>
	createCallerFactory(appSettingsRouter)({ user: makeUser(uid) });

const centro = callerAs("scope-centro");
const norte = callerAs("scope-centro::norte");

beforeAll(async () => {
	await pg.exec(SCHEMA_DDL);
});

describe("appSettings", () => {
	it("creates defaults on first read", async () => {
		const settings = await centro.get();
		expect(settings.company_title).toBe("Antro POS");
		expect(settings.user_uid).toBe("scope-centro");
	});

	it("saves the company title and colours", async () => {
		const saved = await centro.update({
			company_title: "La Santa",
			primary_color: "#112233",
			accent_color: "#445566",
			background_color: "#778899",
			card_color: "#aabbcc",
			text_color: "#ddeeff",
		});
		expect(saved.company_title).toBe("La Santa");
		expect(saved.primary_color).toBe("#112233");

		const reread = await centro.get();
		expect(reread.company_title).toBe("La Santa");
	});

	it("keeps each branch scope on its own row", async () => {
		// user_uid es unico: con multi-sucursal pasa a ser el scope de la
		// sucursal, asi que dos sucursales no pueden pisarse la configuracion.
		await norte.update({
			company_title: "Sucursal Norte",
			primary_color: "#000000",
			accent_color: "#111111",
			background_color: "#222222",
			card_color: "#333333",
			text_color: "#444444",
		});

		expect((await centro.get()).company_title).toBe("La Santa");
		expect((await norte.get()).company_title).toBe("Sucursal Norte");
	});

	it("rejects a colour that is not #RRGGBB", async () => {
		await expect(
			centro.update({
				company_title: "X",
				primary_color: "rojo",
				accent_color: "#445566",
				background_color: "#778899",
				card_color: "#aabbcc",
				text_color: "#ddeeff",
			}),
		).rejects.toThrow();
	});
});

describe("payload from the palette buttons", () => {
	it("survives the extra key the palette shortcut adds", async () => {
		// `applyPalette` hace `{ ...form, ...palette }` y las paletas llevan un
		// campo `name`, asi que el formulario acaba con una clave de mas.
		const polluted = {
			name: "Noche premium",
			company_title: "Club",
			primary_color: "#f8fafc",
			accent_color: "#f59e0b",
			background_color: "#09090b",
			card_color: "#18181b",
			text_color: "#f8fafc",
		} as never;

		const saved = await centro.update(polluted);
		expect(saved.primary_color).toBe("#f8fafc");
	});
});
