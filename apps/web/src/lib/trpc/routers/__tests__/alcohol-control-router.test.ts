import { afterAll, describe, expect, it, mock } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestDb, makeUser } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

await db.execute(
	sql.raw(`
	CREATE TABLE IF NOT EXISTS ingredients (
		id serial PRIMARY KEY,
		name varchar(255) NOT NULL,
		unit varchar(20) NOT NULL,
		stock_quantity real NOT NULL DEFAULT 0,
		package_size real NOT NULL DEFAULT 1,
		low_stock_threshold real NOT NULL DEFAULT 0,
		shelf_life_days real,
		opened_days real,
		user_uid varchar(255) NOT NULL,
		created_at timestamp DEFAULT now(),
		updated_at timestamp DEFAULT now()
	)
`),
);

const { alcoholControlRouter } = await import("../alcohol-control");
const { createCallerFactory } = await import("../../init");

const caller = createCallerFactory(alcoholControlRouter)({
	user: makeUser("alcohol-user-1"),
});

afterAll(async () => {
	await pg.close();
});

describe("alcoholControl", () => {
	it("seeds demo bottles and records a scale reading", async () => {
		const overview = await caller.overview();
		expect(overview.bottles.length).toBeGreaterThanOrEqual(3);

		const bottle = overview.bottles[0];
		expect(bottle).toBeDefined();
		if (!bottle) throw new Error("Missing demo bottle");

		const result = await caller.recordReading({
			bottleId: bottle.id,
			weightG: Math.max(1, bottle.emptyWeightG + bottle.fullVolumeMl * 0.4),
		});

		expect(result.ok).toBe(true);
		expect(["ok", "review", "critical"]).toContain(result.evaluation.status);
	});
});
