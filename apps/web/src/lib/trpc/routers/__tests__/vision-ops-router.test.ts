import { afterAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { visionOpsRouter } = await import("../vision-ops");
const { createCallerFactory } = await import("../../init");

const caller = createCallerFactory(visionOpsRouter)({
	user: makeUser("vision-user-1"),
});

afterAll(async () => {
	await pg.close();
});

describe("visionOps.recordSignal", () => {
	it("evaluates and stores a normalized warehouse sensor event", async () => {
		const result = await caller.recordSignal({
			signal: {
				zone: "Almacén",
				event: "Cruce físico hacia barra",
				source: "sensor",
				confidence: 0.94,
			},
			pos: {
				hasCompatibleSale: false,
				hasActiveTransfer: false,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
			},
			inventory: {
				itemName: "Caja de cerveza",
				currentDifference: -1,
				tolerance: 0,
			},
		});

		expect(result.ok).toBe(true);
		expect(result.incident.risk).toBe("critical");
		expect(result.incident.result).toBe("Salida no justificada");

		const overview = await caller.overview();
		expect(
			overview.incidents.some(
				(item) => item.event === "Cruce físico hacia barra",
			),
		).toBe(true);
	});

	it("evaluates an authorized warehouse event as OK", async () => {
		const result = await caller.recordSignal({
			signal: {
				zone: "Almacén",
				event: "Cruce físico hacia barra",
				source: "sensor",
			},
			pos: {
				hasCompatibleSale: false,
				hasActiveTransfer: true,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
			},
			inventory: {
				itemName: "Caja de cerveza",
			},
		});

		expect(result.ok).toBe(true);
		expect(result.incident.risk).toBe("ok");
		expect(result.incident.result).toBe("Cuadra");
	});

	it("evaluates and stores a fused track session", async () => {
		const result = await caller.recordTrackSession({
			session: {
				sessionId: "cava-fusion-001",
				zone: "Cava",
				startSecond: 0,
				endSecond: 16,
				observations: [
					{
						atSecond: 1,
						source: "camera",
						zone: "Cava",
						event: "person_entered",
						confidence: 0.9,
					},
					{
						atSecond: 5,
						source: "laser",
						zone: "Cava",
						event: "line_crossed",
						confidence: 0.98,
					},
					{
						atSecond: 9,
						source: "scale",
						zone: "Cava",
						event: "weight_changed",
						quantityChange: -210,
						confidence: 0.99,
					},
				],
			},
			pos: {
				hasCompatibleSale: false,
				hasActiveTransfer: false,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
				recipeExpectedQuantity: 0,
			},
			inventory: {
				itemName: "Don Julio 70",
				currentDifference: -210,
				tolerance: 45,
			},
		});

		expect(result.ok).toBe(true);
		expect(result.incident.risk).toBe("critical");
		expect(result.incident.evidenceLabel).toBe("session-cava-fusion-001");
		expect(result.incident.triggeredSignals).toContain("laser:line_crossed");
	});
});
