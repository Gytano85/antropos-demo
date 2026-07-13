import { describe, expect, it } from "bun:test";
import {
	evaluateTrackSession,
	evaluateVisionEvent,
	type InventoryContext,
	type PhysicalSignal,
	type PosContext,
	scenarioInput,
	type TrackSession,
} from "../../../vision-ops/engine";

describe("vision ops engine", () => {
	it("flags premium-zone activity without sale or authorization", () => {
		const input = scenarioInput("premium");
		const result = evaluateVisionEvent(
			input.signal,
			input.pos,
			input.inventory,
		);

		expect(result.zone).toBe("Cava");
		expect(result.risk).toBe("high");
		expect(result.posContext).toContain("Sin venta premium");
		expect(result.result).toBe("Revisar clip y consumo por receta");
	});

	it("marks premium-zone activity as OK when POS has compatible sale", () => {
		const signal: PhysicalSignal = {
			zone: "Cava",
			event: "Movimiento en repisa premium",
			source: "vms",
		};
		const pos: PosContext = {
			hasCompatibleSale: true,
			hasActiveTransfer: false,
			hasReadyOrder: false,
			hasAuthorizedEmployee: false,
			hasActivePreparation: false,
		};
		const inventory: InventoryContext = {
			itemName: "Botella premium",
			currentDifference: 0,
			tolerance: 60,
		};

		const result = evaluateVisionEvent(signal, pos, inventory);

		expect(result.risk).toBe("ok");
		expect(result.result).toBe("Evento compatible con operación registrada");
	});

	it("escalates bottle weight loss beyond recipe tolerance", () => {
		const input = scenarioInput("weight");
		const result = evaluateVisionEvent(
			input.signal,
			input.pos,
			input.inventory,
		);

		expect(result.zone).toBe("Cava");
		expect(result.risk).toBe("critical");
		expect(result.posContext).toBe("Recetas vendidas justifican 135 ml");
		expect(result.inventoryContext).toBe(
			"Diferencia mayor a tolerancia configurada",
		);
	});

	it("flags kitchen pass event without ready order", () => {
		const input = scenarioInput("kitchen");
		const result = evaluateVisionEvent(
			input.signal,
			input.pos,
			input.inventory,
		);

		expect(result.zone).toBe("Cocina");
		expect(result.risk).toBe("medium");
		expect(result.posContext).toBe("No hay comanda lista compatible");
	});

	it("flags warehouse crossing without transfer as critical", () => {
		const input = scenarioInput("warehouse");
		const result = evaluateVisionEvent(
			input.signal,
			input.pos,
			input.inventory,
		);

		expect(result.zone).toBe("Almacén");
		expect(result.risk).toBe("critical");
		expect(result.result).toBe("Salida no justificada");
	});

	it("normalizes unaccented external zone names", () => {
		const result = evaluateVisionEvent(
			{
				zone: "Almacen",
				event: "Cruce fisico hacia barra",
				source: "sensor",
			},
			{
				hasCompatibleSale: false,
				hasActiveTransfer: false,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
			},
			{
				itemName: "Caja de cerveza",
				currentDifference: -1,
				tolerance: 0,
			},
		);

		expect(result.risk).toBe("critical");
		expect(result.result).toBe("Salida no justificada");
	});

	it("escalates fused camera laser and scale activity in premium storage", () => {
		const session: TrackSession = {
			sessionId: "cava-001",
			zone: "Cava",
			startSecond: 0,
			endSecond: 18,
			observations: [
				{
					atSecond: 1,
					source: "camera",
					zone: "Cava",
					event: "person_entered",
					confidence: 0.9,
				},
				{
					atSecond: 4,
					source: "laser",
					zone: "Cava",
					event: "line_crossed",
					confidence: 0.98,
				},
				{
					atSecond: 8,
					source: "camera",
					zone: "Cava",
					event: "shelf_reached",
					confidence: 0.86,
				},
				{
					atSecond: 10,
					source: "scale",
					zone: "Cava",
					event: "weight_changed",
					quantityChange: -180,
					confidence: 0.99,
				},
			],
		};

		const result = evaluateTrackSession(
			session,
			{
				hasCompatibleSale: false,
				hasActiveTransfer: false,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
				recipeExpectedQuantity: 0,
			},
			{
				itemName: "Botella premium",
				currentDifference: -180,
				tolerance: 45,
			},
		);

		expect(result.risk).toBe("critical");
		expect(result.result).toBe("Consumo fisico no cerrado");
		expect(result.fusionScore).toBeGreaterThanOrEqual(80);
		expect(result.triggeredSignals).toContain("laser:line_crossed");
	});

	it("allows warehouse sensor fusion when an active transfer exists", () => {
		const result = evaluateTrackSession(
			{
				sessionId: "almacen-002",
				zone: "Almacen",
				startSecond: 0,
				endSecond: 7,
				observations: [
					{
						atSecond: 0,
						source: "ir",
						zone: "Almacen",
						event: "line_crossed",
						confidence: 0.97,
					},
					{
						atSecond: 2,
						source: "camera",
						zone: "Almacen",
						event: "object_removed",
						confidence: 0.82,
					},
				],
			},
			{
				hasCompatibleSale: false,
				hasActiveTransfer: true,
				hasReadyOrder: false,
				hasAuthorizedEmployee: false,
				hasActivePreparation: false,
			},
			{
				itemName: "Caja de cerveza",
				currentDifference: 0,
				tolerance: 0,
			},
		);

		expect(result.risk).toBe("ok");
		expect(result.result).toBe("Movimiento autorizado");
		expect(result.posContext).toBe("Traspaso o empleado autorizado");
	});
});
