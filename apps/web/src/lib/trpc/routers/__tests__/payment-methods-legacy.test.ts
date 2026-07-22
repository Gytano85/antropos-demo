import { beforeAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { paymentMethodsRouter } = await import("../payment-methods");
const { createCallerFactory } = await import("../../init");

const caller = createCallerFactory(paymentMethodsRouter)({
	user: makeUser("scope::norte"),
});

beforeAll(async () => {
	// Tabla tal y como venia en la copia de base empaquetada: sin dueño y con el
	// nombre unico a nivel global.
	await pg.exec(`
		CREATE TABLE payment_methods (
			id serial PRIMARY KEY,
			name varchar(50) NOT NULL UNIQUE,
			created_at timestamp DEFAULT NOW()
		);
	`);
	await pg.exec("INSERT INTO payment_methods (name) VALUES ('Efectivo')");
});

describe("payment methods on a database predating the owner column", () => {
	it("adds the missing column instead of failing the query", async () => {
		const list = await caller.list();
		// La fila heredada sigue visible; antes la consulta reventaba con
		// "column user_uid does not exist" y arrastraba al resto de la pantalla.
		expect(list.map((method) => method.name)).toContain("Efectivo");
	});

	it("lets the branch add its own method despite the old global unique name", async () => {
		const created = await caller.create({ name: "Efectivo" });
		expect(created.user_uid).toBe("scope::norte");
	});
});
