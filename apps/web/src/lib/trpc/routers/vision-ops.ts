import { Buffer } from "node:buffer";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	evaluateTrackSession,
	evaluateVisionEvent,
	type FusionObservation,
	type InventoryContext,
	type PhysicalSignal,
	type PosContext,
	scenarioInput,
	type TrackSession,
	type VisionEvaluation,
	type VisionRisk,
	type VisionScenario,
} from "@/lib/vision-ops/engine";
import { protectedProcedure, router } from "../init";

type QueryResult<T> = T[] | { rows?: T[] };

type VisionSourceRow = {
	id: number;
	name: string;
	kind: string;
	zone: string;
	signal: string;
	status: string;
	software_first: boolean;
};

type VisionZoneRow = {
	id: number;
	name: string;
	purpose: string;
	pos_context: string;
	events: string;
};

type VisionRuleRow = {
	id: number;
	name: string;
	observed: string;
	expected: string;
	check_text: string;
	risk: VisionRisk;
	enabled: boolean;
};

type VisionIncidentRow = {
	id: number;
	created_at: Date | string | null;
	zone: string;
	event: string;
	pos_context: string;
	inventory_context: string;
	result: string;
	risk: VisionRisk;
	status: string;
	evidence_label: string | null;
};

const scenarioSchema = z.enum([
	"premium",
	"weight",
	"kitchen",
	"cold-chain",
	"warehouse",
]) satisfies z.ZodType<VisionScenario>;

const incidentInput = z.object({
	scenario: scenarioSchema,
});

const physicalSignalInput = z.object({
	zone: z.string().min(1).max(120),
	event: z.string().min(1).max(240),
	source: z.enum(["camera", "vms", "sensor", "scale", "temperature", "manual"]),
	confidence: z.number().min(0).max(1).optional(),
	quantityChange: z.number().optional(),
	durationSeconds: z.number().min(0).optional(),
}) satisfies z.ZodType<PhysicalSignal>;

const posContextInput = z.object({
	hasCompatibleSale: z.boolean().default(false),
	hasActiveTransfer: z.boolean().default(false),
	hasReadyOrder: z.boolean().default(false),
	hasAuthorizedEmployee: z.boolean().default(false),
	hasActivePreparation: z.boolean().default(false),
	recipeExpectedQuantity: z.number().min(0).optional(),
}) satisfies z.ZodType<PosContext>;

const inventoryContextInput = z.object({
	itemName: z.string().min(1).max(160).optional(),
	currentDifference: z.number().optional(),
	tolerance: z.number().min(0).optional(),
	qualitySensitive: z.boolean().optional(),
}) satisfies z.ZodType<InventoryContext>;

const recordSignalInput = z.object({
	signal: physicalSignalInput,
	pos: posContextInput.default({
		hasCompatibleSale: false,
		hasActiveTransfer: false,
		hasReadyOrder: false,
		hasAuthorizedEmployee: false,
		hasActivePreparation: false,
	}),
	inventory: inventoryContextInput.default({}),
});

const fusionObservationInput = z.object({
	atSecond: z.number().min(0),
	source: z.enum([
		"camera",
		"vms",
		"sensor",
		"scale",
		"temperature",
		"manual",
		"laser",
		"ir",
	]),
	zone: z.string().min(1).max(120),
	event: z.enum([
		"person_entered",
		"person_left",
		"line_crossed",
		"shelf_reached",
		"weight_changed",
		"door_opened",
		"door_closed",
		"object_removed",
		"object_returned",
	]),
	confidence: z.number().min(0).max(1).optional(),
	quantityChange: z.number().optional(),
}) satisfies z.ZodType<FusionObservation>;

const trackSessionInput = z.object({
	session: z.object({
		sessionId: z.string().min(1).max(120),
		zone: z.string().min(1).max(120),
		startSecond: z.number().min(0),
		endSecond: z.number().min(0),
		observations: z.array(fusionObservationInput).min(1).max(40),
	}) satisfies z.ZodType<TrackSession>,
	pos: posContextInput.default({
		hasCompatibleSale: false,
		hasActiveTransfer: false,
		hasReadyOrder: false,
		hasAuthorizedEmployee: false,
		hasActivePreparation: false,
	}),
	inventory: inventoryContextInput.default({}),
});

function rows<T>(result: QueryResult<T>) {
	return Array.isArray(result) ? result : (result.rows ?? []);
}

function repairText(value: string) {
	if (!/[ÃÂâ]/.test(value)) return value;
	try {
		return Buffer.from(value, "latin1").toString("utf8");
	} catch {
		return value;
	}
}

function repairSource(source: VisionSourceRow): VisionSourceRow {
	return {
		...source,
		name: repairText(source.name),
		zone: repairText(source.zone),
		signal: repairText(source.signal),
	};
}

function repairZone(zone: VisionZoneRow): VisionZoneRow {
	return {
		...zone,
		name: repairText(zone.name),
		purpose: repairText(zone.purpose),
		pos_context: repairText(zone.pos_context),
	};
}

function repairRule(rule: VisionRuleRow): VisionRuleRow {
	return {
		...rule,
		name: repairText(rule.name),
		observed: repairText(rule.observed),
		expected: repairText(rule.expected),
		check_text: repairText(rule.check_text),
	};
}

function repairIncident(incident: VisionIncidentRow): VisionIncidentRow {
	return {
		...incident,
		zone: repairText(incident.zone),
		event: repairText(incident.event),
		pos_context: repairText(incident.pos_context),
		inventory_context: repairText(incident.inventory_context),
		result: repairText(incident.result),
		evidence_label: incident.evidence_label
			? repairText(incident.evidence_label)
			: incident.evidence_label,
	};
}

export async function ensureVisionOpsTables() {
	const statements = [
		`CREATE TABLE IF NOT EXISTS vision_sources (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(160) NOT NULL,
			kind varchar(40) NOT NULL,
			zone varchar(120) NOT NULL,
			signal text NOT NULL,
			status varchar(40) NOT NULL DEFAULT 'ready',
			software_first boolean NOT NULL DEFAULT true,
			config_json text NOT NULL DEFAULT '{}',
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS vision_zones (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(120) NOT NULL,
			purpose text NOT NULL,
			pos_context text NOT NULL,
			events text NOT NULL,
			config_json text NOT NULL DEFAULT '{}',
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS vision_rules (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(180) NOT NULL,
			observed text NOT NULL,
			expected text NOT NULL,
			check_text text NOT NULL,
			risk varchar(20) NOT NULL DEFAULT 'medium',
			enabled boolean NOT NULL DEFAULT true,
			cooldown_seconds integer NOT NULL DEFAULT 90,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS vision_incidents (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			zone varchar(120) NOT NULL,
			event text NOT NULL,
			pos_context text NOT NULL,
			inventory_context text NOT NULL,
			result text NOT NULL,
			risk varchar(20) NOT NULL DEFAULT 'medium',
			status varchar(40) NOT NULL DEFAULT 'new',
			evidence_label varchar(160),
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
	];

	for (const statement of statements) {
		await db.execute(sql.raw(statement));
	}
}

async function ensureVisionOpsDemo(userId: string) {
	await ensureVisionOpsTables();

	const sourceCount = rows<{ count: string | number }>(
		await db.execute(
			sql`SELECT count(*) as count FROM vision_sources WHERE user_uid = ${userId}`,
		),
	);
	if (Number(sourceCount[0]?.count ?? 0) === 0) {
		await db.execute(sql`
			INSERT INTO vision_sources (user_uid, name, kind, zone, signal, status, software_first)
			VALUES
				(${userId}, 'Cámara barra principal', 'camera', 'Barra', 'Movimiento, permanencia y cruce de línea', 'online', true),
				(${userId}, 'Cámara cava premium', 'vms', 'Cava', 'Actividad en repisa y clip de evidencia', 'online', true),
				(${userId}, 'Cámara pase de cocina', 'camera', 'Cocina', 'Salida de platos vs comandas listas', 'online', true),
				(${userId}, 'Sensor puerta refrigerador', 'sensor', 'Refrigerador', 'Apertura, cierre y tiempo abierto', 'ready', false),
				(${userId}, 'Báscula botella Don Julio 70', 'scale', 'Cava', 'Cambio de peso contra consumo por receta', 'ready', false),
				(${userId}, 'Sensor temperatura cocina fría', 'temperature', 'Calidad', 'Temperatura fuera de rango', 'ready', false)
		`);
	}

	const zoneCount = rows<{ count: string | number }>(
		await db.execute(
			sql`SELECT count(*) as count FROM vision_zones WHERE user_uid = ${userId}`,
		),
	);
	if (Number(zoneCount[0]?.count ?? 0) === 0) {
		await db.execute(sql`
			INSERT INTO vision_zones (user_uid, name, purpose, pos_context, events)
			VALUES
				(${userId}, 'Barra', 'Detectar actividad de servido y permanencia detrás de barra.', 'Ventas de bebidas, recetas, empleado en turno.', 'motion_burst,person_in_zone,served_candidate'),
				(${userId}, 'Cava', 'Controlar botellas premium sin depender de reconocer cada etiqueta.', 'Ventas premium, inventario esperado, permisos de bodega.', 'door_opened,shelf_activity,weight_decreased'),
				(${userId}, 'Cocina', 'Cruzar salida física de platos contra comandas listas.', 'Comandas activas, estado de cocina, mesa y mesero.', 'plate_crossed_line,station_occupied,order_ready_timeout'),
				(${userId}, 'Refrigerador', 'Detectar riesgo de calidad y apertura sin operación compatible.', 'Productos perecederos, vida útil y calidad.', 'door_open_too_long,temperature_out_of_range'),
				(${userId}, 'Almacén', 'Auditar entradas, salidas y transferencias internas.', 'Transferencias, turnos, permisos e inventario real.', 'line_crossed,person_in_restricted_zone')
		`);
	}

	const ruleCount = rows<{ count: string | number }>(
		await db.execute(
			sql`SELECT count(*) as count FROM vision_rules WHERE user_uid = ${userId}`,
		),
	);
	if (Number(ruleCount[0]?.count ?? 0) === 0) {
		await db.execute(sql`
			INSERT INTO vision_rules (user_uid, name, observed, expected, check_text, risk, cooldown_seconds)
			VALUES
				(${userId}, 'Actividad en cava sin venta compatible', 'Cámara/sensor detecta apertura o movimiento en cava.', 'Venta premium, transferencia o empleado autorizado.', 'Ventana de 90 segundos contra POS e inventario.', 'high', 90),
				(${userId}, 'Peso baja más que receta', 'Báscula reporta pérdida de peso en botella.', 'Consumo calculado por recetas vendidas.', 'Diferencia contra tolerancia configurable.', 'critical', 180),
				(${userId}, 'Plato sale sin comanda lista', 'Cruce en pase de cocina.', 'Comanda lista y mesa asociada.', 'Mesa/producto/tiempo de cocina.', 'medium', 60),
				(${userId}, 'Refrigerador abierto demasiado tiempo', 'Puerta abierta y/o temperatura fuera de rango.', 'Apertura breve durante operación normal.', 'Umbral por producto y zona de calidad.', 'medium', 300),
				(${userId}, 'Caja abierta sin transacción', 'Evento visual/sensor de caja abierta.', 'Venta, devolución, retiro o corte.', 'Transacción en ventana de tiempo.', 'critical', 120)
		`);
	}

	const incidentCount = rows<{ count: string | number }>(
		await db.execute(
			sql`SELECT count(*) as count FROM vision_incidents WHERE user_uid = ${userId}`,
		),
	);
	if (Number(incidentCount[0]?.count ?? 0) === 0) {
		await insertIncident(userId, "premium");
		await insertIncident(userId, "weight");
		await insertIncident(userId, "kitchen");
	}
}

async function insertIncident(userId: string, scenario: VisionScenario) {
	const input = scenarioInput(scenario);
	const incident = evaluateVisionEvent(
		input.signal,
		input.pos,
		input.inventory,
	);
	await insertEvaluation(userId, incident);
}

async function insertEvaluation(userId: string, incident: VisionEvaluation) {
	await db.execute(sql`
		INSERT INTO vision_incidents (
			user_uid, zone, event, pos_context, inventory_context, result, risk, evidence_label
		)
		VALUES (
			${userId}, ${incident.zone}, ${incident.event}, ${incident.posContext},
			${incident.inventoryContext}, ${incident.result}, ${incident.risk}, ${incident.evidenceLabel}
		)
	`);
}

export const visionOpsRouter = router({
	overview: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
		await ensureVisionOpsDemo(ctx.user.id);

		const [sourcesResult, zonesResult, rulesResult, incidentsResult] =
			await Promise.all([
				db.execute(
					sql`SELECT * FROM vision_sources WHERE user_uid = ${ctx.user.id} ORDER BY id`,
				),
				db.execute(
					sql`SELECT * FROM vision_zones WHERE user_uid = ${ctx.user.id} ORDER BY id`,
				),
				db.execute(
					sql`SELECT * FROM vision_rules WHERE user_uid = ${ctx.user.id} ORDER BY id`,
				),
				db.execute(sql`
					SELECT * FROM vision_incidents
					WHERE user_uid = ${ctx.user.id}
					ORDER BY created_at DESC, id DESC
					LIMIT 30
				`),
			]);

		const sources = rows<VisionSourceRow>(sourcesResult).map(repairSource);
		const zones = rows<VisionZoneRow>(zonesResult).map(repairZone);
		const rules = rows<VisionRuleRow>(rulesResult).map(repairRule);
		const incidents =
			rows<VisionIncidentRow>(incidentsResult).map(repairIncident);
		const reviewCount = incidents.filter(
			(incident) => incident.risk !== "ok",
		).length;
		const posLinkedCount = incidents.filter(
			(incident) => incident.pos_context,
		).length;

		return {
			sources,
			zones: zones.map((zone) => ({
				...zone,
				events: zone.events.split(",").filter(Boolean),
			})),
			rules,
			incidents: incidents.map((incident) => ({
				...incident,
				created_at:
					incident.created_at instanceof Date
						? incident.created_at.toISOString()
						: incident.created_at,
			})),
			metrics: {
				sourceCount: sources.length,
				ruleCount: rules.filter((rule) => rule.enabled).length,
				incidentCount: incidents.length,
				reviewCount,
				posLinkedPct: incidents.length
					? Math.round((posLinkedCount / incidents.length) * 100)
					: 0,
				latencyLabel: "2.4s",
			},
		};
	}),

	simulateIncident: protectedProcedure
		.input(incidentInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureVisionOpsDemo(ctx.user.id);
			await insertIncident(ctx.user.id, input.scenario);
			return { ok: true };
		}),

	recordSignal: protectedProcedure
		.input(recordSignalInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureVisionOpsDemo(ctx.user.id);
			const incident = evaluateVisionEvent(
				input.signal,
				input.pos,
				input.inventory,
			);
			await insertEvaluation(ctx.user.id, incident);
			return { ok: true, incident };
		}),

	recordTrackSession: protectedProcedure
		.input(trackSessionInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureVisionOpsDemo(ctx.user.id);
			const incident = evaluateTrackSession(
				input.session,
				input.pos,
				input.inventory,
			);
			await insertEvaluation(ctx.user.id, incident);
			return { ok: true, incident };
		}),
});
