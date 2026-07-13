export type VisionRisk = "ok" | "medium" | "high" | "critical";

export type VisionScenario =
	| "premium"
	| "weight"
	| "kitchen"
	| "cold-chain"
	| "warehouse";

export type FusionObservation = {
	atSecond: number;
	source: PhysicalSignal["source"] | "laser" | "ir";
	zone: string;
	event:
		| "person_entered"
		| "person_left"
		| "line_crossed"
		| "shelf_reached"
		| "weight_changed"
		| "door_opened"
		| "door_closed"
		| "object_removed"
		| "object_returned";
	confidence?: number;
	quantityChange?: number;
};

export type PhysicalSignal = {
	zone: string;
	event: string;
	source: "camera" | "vms" | "sensor" | "scale" | "temperature" | "manual";
	confidence?: number;
	quantityChange?: number;
	durationSeconds?: number;
};

export type PosContext = {
	hasCompatibleSale: boolean;
	hasActiveTransfer: boolean;
	hasReadyOrder: boolean;
	hasAuthorizedEmployee: boolean;
	hasActivePreparation: boolean;
	recipeExpectedQuantity?: number;
};

export type InventoryContext = {
	itemName?: string;
	currentDifference?: number;
	tolerance?: number;
	qualitySensitive?: boolean;
};

export type VisionEvaluation = {
	zone: string;
	event: string;
	posContext: string;
	inventoryContext: string;
	result: string;
	risk: VisionRisk;
	evidenceLabel: string;
};

export type TrackSession = {
	sessionId: string;
	zone: string;
	startSecond: number;
	endSecond: number;
	observations: FusionObservation[];
};

export type TrackEvaluation = VisionEvaluation & {
	sessionId: string;
	durationSeconds: number;
	fusionScore: number;
	triggeredSignals: string[];
};

export function evaluateVisionEvent(
	signal: PhysicalSignal,
	pos: PosContext,
	inventory: InventoryContext,
): VisionEvaluation {
	const zoneKey = zoneKind(signal.zone);

	if (zoneKey === "cava" && signal.source === "scale") {
		return evaluateBottleWeight(signal, pos, inventory);
	}

	if (zoneKey === "cava") {
		return evaluatePremiumZone(signal, pos, inventory);
	}

	if (zoneKey === "cocina") {
		return evaluateKitchenPass(signal, pos, inventory);
	}

	if (zoneKey === "refrigerador") {
		return evaluateColdChain(signal, pos, inventory);
	}

	if (zoneKey === "almacen") {
		return evaluateWarehouse(signal, pos, inventory);
	}

	return {
		zone: signal.zone,
		event: signal.event,
		posContext: "Sin regla específica",
		inventoryContext: inventory.itemName ?? "Sin producto ligado",
		result: "Evento registrado para revisión",
		risk: "medium",
		evidenceLabel: evidenceLabel(signal.zone, signal.event),
	};
}

export function evaluateTrackSession(
	session: TrackSession,
	pos: PosContext,
	inventory: InventoryContext,
): TrackEvaluation {
	const durationSeconds = Math.max(0, session.endSecond - session.startSecond);
	const triggeredSignals = compactSignals(session.observations);
	const hasLineCross = hasEvent(session, "line_crossed");
	const hasShelfReach = hasEvent(session, "shelf_reached");
	const hasWeightLoss = totalQuantityChange(session) < 0;
	const hasObjectRemoved = hasEvent(session, "object_removed");
	const hasDoorOpen = hasEvent(session, "door_opened");
	const sourceCount = new Set(session.observations.map((item) => item.source))
		.size;
	const fusionScore = scoreFusion(session, durationSeconds);
	const authorized =
		pos.hasCompatibleSale ||
		pos.hasActiveTransfer ||
		pos.hasAuthorizedEmployee ||
		pos.hasReadyOrder;
	const zoneKey = zoneKind(session.zone);

	let result = "Actividad registrada";
	let risk: VisionRisk = "medium";
	let posContext = authorized
		? "Operacion compatible en POS"
		: "Sin operacion compatible en POS";
	let inventoryContext = inventory.itemName ?? "Sin producto ligado";

	if (zoneKey === "cava" && (hasShelfReach || hasWeightLoss)) {
		const difference = Math.abs(inventory.currentDifference ?? 0);
		const tolerance = inventory.tolerance ?? 0;
		const observed = Math.abs(totalQuantityChange(session));
		const expected = Math.abs(pos.recipeExpectedQuantity ?? 0);
		const overRecipe = observed > 0 && observed - expected > tolerance;

		risk = authorized && !overRecipe ? "ok" : overRecipe ? "critical" : "high";
		result = risk === "ok" ? "Servido compatible" : "Consumo fisico no cerrado";
		posContext = authorized
			? "Venta o autorizacion encontrada"
			: "Sin venta/autorizacion para la cava";
		inventoryContext =
			overRecipe || difference > tolerance
				? `${inventory.itemName ?? "Producto"} supera tolerancia`
				: (inventory.itemName ?? "Producto premium observado");
	} else if (zoneKey === "almacen" && (hasLineCross || hasObjectRemoved)) {
		risk = authorized ? "ok" : "critical";
		result = authorized
			? "Movimiento autorizado"
			: "Salida fisica sin traspaso";
		posContext = authorized
			? "Traspaso o empleado autorizado"
			: "Sin traspaso activo";
		inventoryContext = inventory.itemName
			? `Producto auditado: ${inventory.itemName}`
			: "Producto sin alta de movimiento";
	} else if (zoneKey === "cocina" && hasLineCross) {
		risk = pos.hasReadyOrder ? "ok" : "medium";
		result = pos.hasReadyOrder
			? "Salida compatible"
			: "Salida sin comanda lista";
		posContext = pos.hasReadyOrder
			? "Comanda lista encontrada"
			: "No hay comanda lista";
		inventoryContext = inventory.itemName ?? "Receta no asociada";
	} else if (zoneKey === "refrigerador" && hasDoorOpen) {
		const tooLong = durationSeconds > 180;
		risk = tooLong && !pos.hasActivePreparation ? "medium" : "ok";
		result = risk === "ok" ? "Apertura normal" : "Apertura prolongada";
		posContext = pos.hasActivePreparation
			? "Preparacion activa"
			: "Sin preparacion activa";
		inventoryContext = inventory.qualitySensitive
			? "Producto sensible a calidad"
			: "Sin producto sensible";
	} else if (sourceCount >= 2 && !authorized && durationSeconds >= 10) {
		risk = fusionScore >= 80 ? "high" : "medium";
		result = "Permanencia no justificada";
	} else if (authorized && fusionScore < 70) {
		risk = "ok";
		result = "Actividad compatible";
	}

	return {
		zone: session.zone,
		event: session.observations.at(-1)?.event ?? "session_closed",
		posContext,
		inventoryContext,
		result,
		risk,
		evidenceLabel: `session-${session.sessionId}`,
		sessionId: session.sessionId,
		durationSeconds,
		fusionScore,
		triggeredSignals,
	};
}

function zoneKind(zone: string) {
	const normalized = normalize(zone);
	if (normalized.includes("cava")) return "cava";
	if (normalized.includes("cocina")) return "cocina";
	if (normalized.includes("refrigerador") || normalized.includes("frio")) {
		return "refrigerador";
	}
	if (normalized.includes("almac")) return "almacen";
	return normalized;
}

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

function hasEvent(session: TrackSession, event: FusionObservation["event"]) {
	return session.observations.some((item) => item.event === event);
}

function totalQuantityChange(session: TrackSession) {
	return session.observations.reduce(
		(total, item) => total + (item.quantityChange ?? 0),
		0,
	);
}

function compactSignals(observations: FusionObservation[]) {
	return observations.map((item) => `${item.source}:${item.event}`);
}

function scoreFusion(session: TrackSession, durationSeconds: number) {
	const sourceCount = new Set(session.observations.map((item) => item.source))
		.size;
	const averageConfidence =
		session.observations.reduce(
			(total, item) => total + (item.confidence ?? 0.75),
			0,
		) / Math.max(1, session.observations.length);
	const sourceScore = Math.min(35, sourceCount * 12);
	const eventScore = Math.min(30, session.observations.length * 6);
	const confidenceScore = Math.round(averageConfidence * 25);
	const durationScore = durationSeconds >= 10 ? 10 : 0;

	return Math.min(
		100,
		sourceScore + eventScore + confidenceScore + durationScore,
	);
}

export function scenarioInput(scenario: VisionScenario): {
	signal: PhysicalSignal;
	pos: PosContext;
	inventory: InventoryContext;
} {
	const basePos: PosContext = {
		hasCompatibleSale: false,
		hasActiveTransfer: false,
		hasReadyOrder: false,
		hasAuthorizedEmployee: false,
		hasActivePreparation: false,
	};

	switch (scenario) {
		case "premium":
			return {
				signal: {
					zone: "Cava",
					event: "Movimiento en repisa premium",
					source: "vms",
					confidence: 0.82,
				},
				pos: basePos,
				inventory: {
					itemName: "Don Julio 70",
					currentDifference: -220,
					tolerance: 60,
				},
			};
		case "weight":
			return {
				signal: {
					zone: "Cava",
					event: "Báscula reporta -240 ml",
					source: "scale",
					quantityChange: -240,
				},
				pos: {
					...basePos,
					hasCompatibleSale: true,
					recipeExpectedQuantity: 135,
				},
				inventory: {
					itemName: "Don Julio 70",
					tolerance: 45,
				},
			};
		case "kitchen":
			return {
				signal: {
					zone: "Cocina",
					event: "Cruce en pase de cocina",
					source: "camera",
					confidence: 0.76,
				},
				pos: basePos,
				inventory: {
					itemName: "Ingredientes de cocina",
					currentDifference: -1,
					tolerance: 0,
				},
			};
		case "cold-chain":
			return {
				signal: {
					zone: "Refrigerador",
					event: "Puerta abierta 4m 20s",
					source: "sensor",
					durationSeconds: 260,
				},
				pos: basePos,
				inventory: {
					itemName: "Productos perecederos",
					qualitySensitive: true,
				},
			};
		case "warehouse":
			return {
				signal: {
					zone: "Almacén",
					event: "Cruce físico hacia barra",
					source: "sensor",
					confidence: 0.94,
				},
				pos: basePos,
				inventory: {
					itemName: "Caja de cerveza",
					currentDifference: -1,
					tolerance: 0,
				},
			};
	}
}

function evaluatePremiumZone(
	signal: PhysicalSignal,
	pos: PosContext,
	inventory: InventoryContext,
): VisionEvaluation {
	const authorized =
		pos.hasCompatibleSale || pos.hasActiveTransfer || pos.hasAuthorizedEmployee;
	const difference = Math.abs(inventory.currentDifference ?? 0);
	const tolerance = inventory.tolerance ?? 0;
	const risk: VisionRisk = authorized
		? "ok"
		: difference > tolerance
			? "high"
			: "medium";

	return {
		zone: signal.zone,
		event: signal.event,
		posContext: authorized
			? "Venta, transferencia o empleado autorizado detectado"
			: "Sin venta premium en ventana de 90 segundos",
		inventoryContext:
			difference > tolerance && inventory.itemName
				? `${inventory.itemName} ya tenía diferencia previa`
				: (inventory.itemName ?? "Botella premium sin diferencia previa"),
		result: authorized
			? "Evento compatible con operación registrada"
			: "Revisar clip y consumo por receta",
		risk,
		evidenceLabel: "clip-cava-23-08",
	};
}

function evaluateBottleWeight(
	signal: PhysicalSignal,
	pos: PosContext,
	inventory: InventoryContext,
): VisionEvaluation {
	const observed = Math.abs(signal.quantityChange ?? 0);
	const expected = Math.abs(pos.recipeExpectedQuantity ?? 0);
	const tolerance = inventory.tolerance ?? 0;
	const difference = observed - expected;
	const risk: VisionRisk =
		difference <= tolerance
			? "ok"
			: difference > tolerance * 2
				? "critical"
				: "high";

	return {
		zone: signal.zone,
		event: signal.event,
		posContext: pos.hasCompatibleSale
			? `Recetas vendidas justifican ${expected} ml`
			: "Sin venta compatible para justificar consumo",
		inventoryContext:
			difference > tolerance
				? "Diferencia mayor a tolerancia configurada"
				: "Consumo dentro de tolerancia",
		result:
			risk === "ok"
				? "Consumo físico compatible"
				: "Posible servido extra o receta mal configurada",
		risk,
		evidenceLabel: "sensor-don-julio-70",
	};
}

function evaluateKitchenPass(
	signal: PhysicalSignal,
	pos: PosContext,
	_inventory: InventoryContext,
): VisionEvaluation {
	return {
		zone: signal.zone,
		event: signal.event,
		posContext: pos.hasReadyOrder
			? "Comanda lista compatible"
			: "No hay comanda lista compatible",
		inventoryContext: pos.hasReadyOrder
			? "Ingredientes descontados por receta"
			: "Ingredientes descontados no coinciden con venta",
		result: pos.hasReadyOrder ? "Cuadra" : "Revisar salida de plato",
		risk: pos.hasReadyOrder ? "ok" : "medium",
		evidenceLabel: "clip-cocina-22-21",
	};
}

function evaluateColdChain(
	signal: PhysicalSignal,
	pos: PosContext,
	inventory: InventoryContext,
): VisionEvaluation {
	const tooLong = (signal.durationSeconds ?? 0) > 180;
	const risk: VisionRisk =
		tooLong && inventory.qualitySensitive && !pos.hasActivePreparation
			? "medium"
			: "ok";

	return {
		zone: signal.zone,
		event: signal.event,
		posContext: pos.hasActivePreparation
			? "Preparación activa detectada"
			: "Sin operación de preparación activa",
		inventoryContext: inventory.qualitySensitive
			? "Productos perecederos en zona de riesgo"
			: "Sin producto sensible ligado",
		result:
			risk === "ok" ? "Apertura compatible" : "Revisar calidad y temperatura",
		risk,
		evidenceLabel: "sensor-frio-00-18",
	};
}

function evaluateWarehouse(
	signal: PhysicalSignal,
	pos: PosContext,
	inventory: InventoryContext,
): VisionEvaluation {
	const authorized = pos.hasActiveTransfer || pos.hasAuthorizedEmployee;

	return {
		zone: signal.zone,
		event: signal.event,
		posContext: authorized
			? "Transferencia o empleado autorizado"
			: "Sin transferencia activa",
		inventoryContext: authorized
			? "Movimiento autorizado"
			: inventory.itemName
				? `Producto no registrado: ${inventory.itemName}`
				: "Producto no registrado",
		result: authorized ? "Cuadra" : "Salida no justificada",
		risk: authorized ? "ok" : "critical",
		evidenceLabel: "clip-almacen-23-31",
	};
}

function evidenceLabel(zone: string, event: string) {
	return `${normalize(zone)}-${normalize(event).replaceAll(" ", "-")}`;
}
