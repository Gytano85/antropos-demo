import { beforeAll, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb, makeUser, SCHEMA_DDL } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { camerasRouter, ensureCameraTables } = await import("../cameras");
const { createCallerFactory } = await import("../../init");
const { cameraDevices } = await import("@/lib/db/schema");

const callerAs = (uid: string) =>
	createCallerFactory(camerasRouter)({ user: makeUser(uid) });

const owner = callerAs("user-1");
const intruder = callerAs("user-2");

const cameraDraft = {
	name: "Barra principal",
	location: "Barra",
	sourceType: "webcam" as const,
	streamUrl: null,
	modelId: "security-camera-with-person/1",
	confidenceThreshold: 0.3,
	checkIntervalSeconds: 5,
	noPersonTimeoutSeconds: 180,
	status: "active" as const,
};

beforeAll(async () => {
	await pg.exec(SCHEMA_DDL);
	await ensureCameraTables();
});

describe("cameras.saveCamera ownership", () => {
	it("refuses to update a camera owned by another account", async () => {
		await owner.saveCamera(cameraDraft);
		const [created] = await db
			.select()
			.from(cameraDevices)
			.where(eq(cameraDevices.user_uid, "user-1"));
		expect(created).toBeDefined();

		// Sin filtro por dueño esto sobrescribia la camara ajena y, como el update
		// fija user_uid al llamante, se la llevaba a su cuenta.
		await expect(
			intruder.saveCamera({
				...cameraDraft,
				id: created.id,
				name: "Robada",
			}),
		).rejects.toThrow();

		const [after] = await db
			.select()
			.from(cameraDevices)
			.where(eq(cameraDevices.id, created.id));
		expect(after.user_uid).toBe("user-1");
		expect(after.name).toBe("Barra principal");
	});

	it("still lets the owner update their own camera", async () => {
		const [mine] = await db
			.select()
			.from(cameraDevices)
			.where(eq(cameraDevices.user_uid, "user-1"));

		await owner.saveCamera({ ...cameraDraft, id: mine.id, name: "Barra 2" });

		const [after] = await db
			.select()
			.from(cameraDevices)
			.where(eq(cameraDevices.id, mine.id));
		expect(after.name).toBe("Barra 2");
		expect(after.user_uid).toBe("user-1");
	});

	it("keeps each account's cameras out of the other's overview", async () => {
		await intruder.saveCamera({ ...cameraDraft, name: "Camara ajena" });

		const mine = await owner.overview();
		const theirs = await intruder.overview();

		expect(mine.devices.every((d) => d.name !== "Camara ajena")).toBe(true);
		expect(theirs.devices.every((d) => d.name !== "Barra 2")).toBe(true);
	});
});
