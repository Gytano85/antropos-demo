import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	cameraAlerts,
	cameraDevices,
	cameraPresenceEvents,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const cameraInput = z.object({
	id: z.number().optional(),
	name: z.string().min(1).max(120),
	location: z.string().min(1).max(120),
	modelId: z.string().min(3).max(160),
	confidenceThreshold: z.number().min(0.05).max(0.95),
	checkIntervalSeconds: z.number().int().min(3).max(120),
	noPersonTimeoutSeconds: z.number().int().min(30).max(1800),
	status: z.enum(["active", "inactive"]),
});

const observationInput = z.object({
	cameraId: z.number(),
	personCount: z.number().int().min(0).max(500),
	confidenceAvg: z.number().min(0).max(1).nullable(),
	status: z.enum([
		"person_detected",
		"empty",
		"presence_error",
		"camera_error",
		"model_not_configured",
	]),
});

export async function ensureCameraTables() {
	const statements = [
		`CREATE TABLE IF NOT EXISTS camera_devices (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(120) NOT NULL,
			location varchar(120) NOT NULL DEFAULT 'Entrada',
			source_type varchar(30) NOT NULL DEFAULT 'webcam',
			model_id varchar(160) NOT NULL DEFAULT 'security-camera-with-person/1',
			confidence_threshold real NOT NULL DEFAULT 0.12,
			check_interval_seconds integer NOT NULL DEFAULT 3,
			no_person_timeout_seconds integer NOT NULL DEFAULT 180,
			status varchar(30) NOT NULL DEFAULT 'active',
			last_seen_at timestamp,
			last_checked_at timestamp,
			last_person_count integer NOT NULL DEFAULT 0,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS camera_presence_events (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			camera_id integer NOT NULL,
			person_count integer NOT NULL DEFAULT 0,
			confidence_avg real,
			status varchar(40) NOT NULL,
			source varchar(40) NOT NULL DEFAULT 'webcam',
			created_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS camera_alerts (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			camera_id integer NOT NULL,
			type varchar(60) NOT NULL,
			message text NOT NULL,
			status varchar(30) NOT NULL DEFAULT 'open',
			started_at timestamp DEFAULT now(),
			resolved_at timestamp,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
	];

	for (const statement of statements) {
		await db.execute(sql.raw(statement));
	}
}

async function ensureCameraDemo(userId: string) {
	await ensureCameraTables();
	const existing = await db
		.select({ count: sql<number>`count(*)` })
		.from(cameraDevices)
		.where(eq(cameraDevices.user_uid, userId));

	if (Number(existing[0]?.count ?? 0) > 0) {
		await db
			.update(cameraDevices)
			.set({
				model_id: "security-camera-with-person/1",
				confidence_threshold: 0.12,
				check_interval_seconds: 3,
				updated_at: new Date(),
			})
			.where(
				sql`${cameraDevices.user_uid} = ${userId} AND ${cameraDevices.model_id} = 'tiny-person-detection-stwdp/6'`,
			);
		return;
	}

	await db.insert(cameraDevices).values({
		user_uid: userId,
		name: "Webcam entrada principal",
		location: "Entrada principal",
		source_type: "webcam",
		model_id: "security-camera-with-person/1",
		confidence_threshold: 0.12,
		check_interval_seconds: 3,
		no_person_timeout_seconds: 180,
		status: "active",
	});
}

export const camerasRouter = router({
	overview: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
		await ensureCameraDemo(ctx.user.id);

		const devices = await db
			.select()
			.from(cameraDevices)
			.where(eq(cameraDevices.user_uid, ctx.user.id))
			.orderBy(cameraDevices.id);

		const events = await db
			.select()
			.from(cameraPresenceEvents)
			.where(eq(cameraPresenceEvents.user_uid, ctx.user.id))
			.orderBy(desc(cameraPresenceEvents.created_at))
			.limit(40);

		const alerts = await db
			.select()
			.from(cameraAlerts)
			.where(eq(cameraAlerts.user_uid, ctx.user.id))
			.orderBy(desc(cameraAlerts.created_at))
			.limit(30);

		return {
			devices: devices.map(mapDevice),
			events: events.map((event) => ({
				id: event.id,
				cameraId: event.camera_id,
				personCount: event.person_count,
				confidenceAvg: event.confidence_avg,
				status: event.status,
				source: event.source,
				createdAt: event.created_at?.toISOString() ?? null,
			})),
			alerts: alerts.map((alert) => ({
				id: alert.id,
				cameraId: alert.camera_id,
				type: alert.type,
				message: alert.message,
				status: alert.status,
				startedAt: alert.started_at?.toISOString() ?? null,
				resolvedAt: alert.resolved_at?.toISOString() ?? null,
			})),
			inferenceConfigured: Boolean(process.env.ROBOFLOW_API_KEY),
		};
	}),

	saveCamera: protectedProcedure
		.input(cameraInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureCameraTables();

			const values = {
				user_uid: ctx.user.id,
				name: input.name,
				location: input.location,
				model_id: input.modelId,
				confidence_threshold: input.confidenceThreshold,
				check_interval_seconds: input.checkIntervalSeconds,
				no_person_timeout_seconds: input.noPersonTimeoutSeconds,
				status: input.status,
				updated_at: new Date(),
			};

			if (input.id) {
				await db
					.update(cameraDevices)
					.set(values)
					.where(eq(cameraDevices.id, input.id));
				return { ok: true };
			}

			await db.insert(cameraDevices).values({
				...values,
				source_type: "webcam",
			});
			return { ok: true };
		}),

	recordObservation: protectedProcedure
		.input(observationInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureCameraTables();

			const [camera] = await db
				.select()
				.from(cameraDevices)
				.where(eq(cameraDevices.id, input.cameraId))
				.limit(1);

			if (!camera || camera.user_uid !== ctx.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Camara no encontrada",
				});
			}

			const now = new Date();
			const detected = input.personCount > 0;
			const nextStatus =
				input.status === "camera_error" ||
				input.status === "model_not_configured"
					? input.status
					: detected
						? "active"
						: "empty";

			await db.insert(cameraPresenceEvents).values({
				user_uid: ctx.user.id,
				camera_id: input.cameraId,
				person_count: input.personCount,
				confidence_avg: input.confidenceAvg,
				status: input.status,
				source: "webcam",
			});

			await db
				.update(cameraDevices)
				.set({
					last_checked_at: now,
					last_seen_at: detected ? now : camera.last_seen_at,
					last_person_count: input.personCount,
					status: nextStatus,
					updated_at: now,
				})
				.where(eq(cameraDevices.id, input.cameraId));

			const lastSeen = detected
				? now
				: (camera.last_seen_at ?? camera.last_checked_at ?? now);
			const secondsWithoutPerson = lastSeen
				? Math.floor((now.getTime() - lastSeen.getTime()) / 1000)
				: Number.POSITIVE_INFINITY;
			const shouldAlert =
				input.status === "camera_error" ||
				input.status === "model_not_configured" ||
				secondsWithoutPerson >= camera.no_person_timeout_seconds;

			if (shouldAlert) {
				const type =
					input.status === "camera_error"
						? "camera_error"
						: input.status === "model_not_configured"
							? "model_not_configured"
							: "no_person_timeout";
				await openAlert(
					ctx.user.id,
					input.cameraId,
					type,
					alertMessage(type, camera.name),
				);
			} else if (detected) {
				await resolveAlerts(ctx.user.id, input.cameraId);
			}

			return {
				ok: true,
				secondsWithoutPerson: Number.isFinite(secondsWithoutPerson)
					? secondsWithoutPerson
					: null,
				shouldAlert,
			};
		}),
});

function mapDevice(device: typeof cameraDevices.$inferSelect) {
	return {
		id: device.id,
		name: device.name,
		location: device.location,
		sourceType: device.source_type,
		modelId: device.model_id,
		confidenceThreshold: device.confidence_threshold,
		checkIntervalSeconds: device.check_interval_seconds,
		noPersonTimeoutSeconds: device.no_person_timeout_seconds,
		status: device.status,
		lastSeenAt: device.last_seen_at?.toISOString() ?? null,
		lastCheckedAt: device.last_checked_at?.toISOString() ?? null,
		lastPersonCount: device.last_person_count,
	};
}

async function openAlert(
	userId: string,
	cameraId: number,
	type: string,
	message: string,
) {
	const existing = await db
		.select()
		.from(cameraAlerts)
		.where(
			sql`${cameraAlerts.user_uid} = ${userId} AND ${cameraAlerts.camera_id} = ${cameraId} AND ${cameraAlerts.type} = ${type} AND ${cameraAlerts.status} = 'open'`,
		)
		.limit(1);

	if (existing.length > 0) return;

	await db.insert(cameraAlerts).values({
		user_uid: userId,
		camera_id: cameraId,
		type,
		message,
		status: "open",
	});
}

async function resolveAlerts(userId: string, cameraId: number) {
	await db
		.update(cameraAlerts)
		.set({
			status: "resolved",
			resolved_at: new Date(),
			updated_at: new Date(),
		})
		.where(
			sql`${cameraAlerts.user_uid} = ${userId} AND ${cameraAlerts.camera_id} = ${cameraId} AND ${cameraAlerts.status} = 'open'`,
		);
}

function alertMessage(type: string, cameraName: string) {
	if (type === "camera_error")
		return `${cameraName}: no se pudo leer la camara.`;
	if (type === "model_not_configured") {
		return `${cameraName}: falta configurar ROBOFLOW_API_KEY para deteccion real.`;
	}
	return `${cameraName}: no se detectaron personas dentro del tiempo configurado.`;
}
