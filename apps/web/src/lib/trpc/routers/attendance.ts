import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
	attendanceAttempts,
	attendanceQrTokens,
	attendanceRecords,
	attendanceSettings,
	employees,
	employeeShiftAssignments,
	employeeShifts,
} from "@/lib/db/schema";
import { protectedProcedure, router } from "../init";

const employeeSchema = z.object({
	id: z.number(),
	name: z.string(),
	phone: z.string().nullable(),
	role: z.string(),
	status: z.string(),
});

const shiftSchema = z.object({
	id: z.number(),
	name: z.string(),
	start_time: z.string(),
	end_time: z.string(),
	grace_minutes: z.number(),
	early_checkin_minutes: z.number(),
	late_absence_minutes: z.number(),
	active_days: z.string(),
});

const settingsSchema = z.object({
	locationName: z.string(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	allowedRadiusMeters: z.number(),
	requireLocation: z.boolean(),
	requirePin: z.boolean(),
	qrTtlSeconds: z.number(),
});

export function attendanceHash(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

function todayKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function atLocalTime(dateKey: string, hhmm: string) {
	const [hours, minutes] = hhmm.split(":").map(Number);
	const date = new Date(`${dateKey}T00:00:00`);
	date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
	return date;
}

function minutesDiff(a: Date, b: Date) {
	return Math.round((a.getTime() - b.getTime()) / 60000);
}

function distanceMeters(
	aLat: number,
	aLng: number,
	bLat: number,
	bLng: number,
) {
	const radius = 6371000;
	const toRad = (v: number) => (v * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const lat1 = toRad(aLat);
	const lat2 = toRad(bLat);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return Math.round(2 * radius * Math.asin(Math.sqrt(h)));
}

async function ensureDemo(userId: string) {
	await ensureAttendanceTables();
	const existing = await db
		.select({ count: sql<number>`count(*)` })
		.from(employees)
		.where(eq(employees.user_uid, userId));

	if (Number(existing[0]?.count ?? 0) === 0) {
		await db.insert(employees).values([
			{ user_uid: userId, name: "Carlos Mendez", role: "Bartender", phone: "55 1000 1001", pin_hash: attendanceHash("1234") },
			{ user_uid: userId, name: "Ana Lopez", role: "Host", phone: "55 1000 1002", pin_hash: attendanceHash("1234") },
			{ user_uid: userId, name: "Miguel Torres", role: "Seguridad", phone: "55 1000 1003", pin_hash: attendanceHash("1234") },
			{ user_uid: userId, name: "Sofia Ramirez", role: "Mesera", phone: "55 1000 1004", pin_hash: attendanceHash("1234") },
			{ user_uid: userId, name: "Diana Cruz", role: "Cajera", phone: "55 1000 1005", pin_hash: attendanceHash("1234") },
		]);
	}

	const existingShifts = await db
		.select({ count: sql<number>`count(*)` })
		.from(employeeShifts)
		.where(eq(employeeShifts.user_uid, userId));

	if (Number(existingShifts[0]?.count ?? 0) === 0) {
		await db.insert(employeeShifts).values([
			{
				user_uid: userId,
				name: "Turno noche",
				start_time: "21:00",
				end_time: "03:00",
				grace_minutes: 10,
				early_checkin_minutes: 30,
				late_absence_minutes: 90,
				active_days: "0,1,2,3,4,5,6",
			},
		]);
	}

	const existingSettings = await db.query.attendanceSettings.findFirst({
		where: eq(attendanceSettings.user_uid, userId),
	});
	if (!existingSettings) {
		await db.insert(attendanceSettings).values({
			user_uid: userId,
			location_name: "Antro demo",
			allowed_radius_meters: 100,
			require_location: false,
			require_pin: true,
			qr_ttl_seconds: 60,
		});
	}

	await ensureTodayAssignments(userId);
}

export async function ensureAttendanceTables() {
	await db.execute(sql.raw(`
		CREATE TABLE IF NOT EXISTS attendance_settings (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL UNIQUE,
			location_name varchar(120) NOT NULL DEFAULT 'Antro',
			latitude real,
			longitude real,
			allowed_radius_meters integer NOT NULL DEFAULT 100,
			require_location boolean NOT NULL DEFAULT false,
			require_pin boolean NOT NULL DEFAULT true,
			qr_ttl_seconds integer NOT NULL DEFAULT 60,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS employees (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(255) NOT NULL,
			phone varchar(30),
			role varchar(80) NOT NULL,
			pin_hash varchar(128) NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'active',
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS employee_shifts (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(120) NOT NULL,
			start_time varchar(5) NOT NULL,
			end_time varchar(5) NOT NULL,
			grace_minutes integer NOT NULL DEFAULT 10,
			early_checkin_minutes integer NOT NULL DEFAULT 30,
			late_absence_minutes integer NOT NULL DEFAULT 90,
			active_days varchar(30) NOT NULL DEFAULT '0,1,2,3,4,5,6',
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS employee_shift_assignments (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			employee_id integer NOT NULL,
			shift_id integer NOT NULL,
			shift_date varchar(10) NOT NULL,
			expected_start_at timestamp NOT NULL,
			expected_end_at timestamp NOT NULL,
			created_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS attendance_qr_tokens (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			token_hash varchar(128) NOT NULL UNIQUE,
			purpose varchar(20) NOT NULL,
			shift_id integer,
			valid_from timestamp NOT NULL,
			expires_at timestamp NOT NULL,
			created_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS attendance_records (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			employee_id integer NOT NULL,
			shift_assignment_id integer,
			check_in_at timestamp,
			check_out_at timestamp,
			check_in_status varchar(40),
			check_out_status varchar(40),
			minutes_late integer NOT NULL DEFAULT 0,
			minutes_early_leave integer NOT NULL DEFAULT 0,
			overtime_minutes integer NOT NULL DEFAULT 0,
			qr_token_id integer,
			device_fingerprint text,
			latitude real,
			longitude real,
			distance_meters integer,
			manager_note text,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS attendance_attempts (
			id serial PRIMARY KEY,
			user_uid varchar(255),
			employee_id integer,
			token_hash varchar(128),
			purpose varchar(20),
			result varchar(40) NOT NULL,
			reason text,
			latitude real,
			longitude real,
			distance_meters integer,
			device_fingerprint text,
			created_at timestamp DEFAULT now()
		);
	`));
}

async function ensureTodayAssignments(userId: string) {
	const dateKey = todayKey();
	const existing = await db.query.employeeShiftAssignments.findFirst({
		where: and(
			eq(employeeShiftAssignments.user_uid, userId),
			eq(employeeShiftAssignments.shift_date, dateKey),
		),
	});
	if (existing) return;

	const [shift] = await db
		.select()
		.from(employeeShifts)
		.where(eq(employeeShifts.user_uid, userId))
		.limit(1);
	const staff = await db
		.select()
		.from(employees)
		.where(eq(employees.user_uid, userId));
	if (!shift || staff.length === 0) return;

	const expectedStart = atLocalTime(dateKey, shift.start_time);
	const expectedEnd = atLocalTime(dateKey, shift.end_time);
	if (expectedEnd <= expectedStart) expectedEnd.setDate(expectedEnd.getDate() + 1);

	await db.insert(employeeShiftAssignments).values(
		staff.map((employee) => ({
			user_uid: userId,
			employee_id: employee.id,
			shift_id: shift.id,
			shift_date: dateKey,
			expected_start_at: expectedStart,
			expected_end_at: expectedEnd,
		})),
	);
}

async function getSettings(userId: string) {
	await ensureDemo(userId);
	const row = await db.query.attendanceSettings.findFirst({
		where: eq(attendanceSettings.user_uid, userId),
	});
	if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return {
		locationName: row.location_name,
		latitude: row.latitude,
		longitude: row.longitude,
		allowedRadiusMeters: row.allowed_radius_meters,
		requireLocation: row.require_location,
		requirePin: row.require_pin,
		qrTtlSeconds: row.qr_ttl_seconds,
	};
}

export const attendanceRouter = router({
	overview: protectedProcedure.query(async ({ ctx }) => {
		await ensureDemo(ctx.user.id);
		const dateKey = todayKey();
		const [staff, shifts, records, attempts, settings] = await Promise.all([
			db.select().from(employees).where(eq(employees.user_uid, ctx.user.id)),
			db.select().from(employeeShifts).where(eq(employeeShifts.user_uid, ctx.user.id)),
			db
				.select()
				.from(attendanceRecords)
				.where(eq(attendanceRecords.user_uid, ctx.user.id)),
			db
				.select()
				.from(attendanceAttempts)
				.where(eq(attendanceAttempts.user_uid, ctx.user.id)),
			getSettings(ctx.user.id),
		]);
		const assignments = await db
			.select()
			.from(employeeShiftAssignments)
			.where(
				and(
					eq(employeeShiftAssignments.user_uid, ctx.user.id),
					eq(employeeShiftAssignments.shift_date, dateKey),
				),
			);

		const rows = assignments.map((assignment) => {
			const employee = staff.find((item) => item.id === assignment.employee_id);
			const shift = shifts.find((item) => item.id === assignment.shift_id);
			const record = records.find(
				(item) => item.shift_assignment_id === assignment.id,
			);
			let status = "Pendiente";
			if (record?.check_in_at) status = record.check_in_status ?? "Registrado";
			return {
				assignment,
				employee,
				shift,
				record,
				status,
			};
		});

		return {
			settings,
			employees: staff.map(({ pin_hash, user_uid, created_at, updated_at, ...e }) => e),
			shifts,
			rows,
			attempts: attempts.slice(-20).reverse(),
			summary: {
				expected: rows.length,
				checkedIn: rows.filter((row) => row.record?.check_in_at).length,
				late: rows.filter((row) => row.record?.check_in_status === "Tarde").length,
				pending: rows.filter((row) => !row.record?.check_in_at).length,
				rejected: attempts.filter((item) => item.result === "rejected").length,
			},
		};
	}),

	updateSettings: protectedProcedure
		.input(settingsSchema)
		.mutation(async ({ ctx, input }) => {
			await ensureDemo(ctx.user.id);
			await db
				.update(attendanceSettings)
				.set({
					location_name: input.locationName,
					latitude: input.latitude,
					longitude: input.longitude,
					allowed_radius_meters: input.allowedRadiusMeters,
					require_location: input.requireLocation,
					require_pin: input.requirePin,
					qr_ttl_seconds: input.qrTtlSeconds,
					updated_at: new Date(),
				})
				.where(eq(attendanceSettings.user_uid, ctx.user.id));
			return getSettings(ctx.user.id);
		}),

	createEmployee: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				role: z.string().min(1),
				phone: z.string().optional(),
				pin: z.string().min(4).max(10),
			}),
		)
		.output(employeeSchema)
		.mutation(async ({ ctx, input }) => {
			const [created] = await db
				.insert(employees)
				.values({
					user_uid: ctx.user.id,
					name: input.name,
					role: input.role,
					phone: input.phone,
					pin_hash: attendanceHash(input.pin),
				})
				.returning();
			await ensureTodayAssignments(ctx.user.id);
			return created;
		}),

	createShift: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				startTime: z.string(),
				endTime: z.string(),
				graceMinutes: z.number().int().min(0).max(120),
			}),
		)
		.output(shiftSchema)
		.mutation(async ({ ctx, input }) => {
			const [created] = await db
				.insert(employeeShifts)
				.values({
					user_uid: ctx.user.id,
					name: input.name,
					start_time: input.startTime,
					end_time: input.endTime,
					grace_minutes: input.graceMinutes,
				})
				.returning();
			return created;
		}),

	generateQr: protectedProcedure
		.input(z.object({ purpose: z.enum(["check_in", "check_out"]) }))
		.mutation(async ({ ctx, input }) => {
			await ensureDemo(ctx.user.id);
			const settings = await getSettings(ctx.user.id);
			const rawToken = randomBytes(24).toString("hex");
			const now = new Date();
			const expires = new Date(now.getTime() + settings.qrTtlSeconds * 1000);
			await db.insert(attendanceQrTokens).values({
				user_uid: ctx.user.id,
				token_hash: attendanceHash(rawToken),
				purpose: input.purpose,
				valid_from: now,
				expires_at: expires,
			});
			return {
				token: rawToken,
				expiresAt: expires,
				url: `/employee-checkin/${rawToken}?purpose=${input.purpose}`,
			};
		}),
});

export async function submitAttendance(input: {
	token: string;
	purpose: "check_in" | "check_out";
	employeeId: number;
	pin: string;
	latitude?: number | null;
	longitude?: number | null;
	deviceFingerprint?: string | null;
}) {
	await ensureAttendanceTables();
	const tokenHash = attendanceHash(input.token);
	const now = new Date();
	const token = await db.query.attendanceQrTokens.findFirst({
		where: and(
			eq(attendanceQrTokens.token_hash, tokenHash),
			eq(attendanceQrTokens.purpose, input.purpose),
			lte(attendanceQrTokens.valid_from, now),
			gte(attendanceQrTokens.expires_at, now),
		),
	});
	if (!token) {
		await db.insert(attendanceAttempts).values({
			token_hash: tokenHash,
			employee_id: input.employeeId,
			purpose: input.purpose,
			result: "rejected",
			reason: "QR vencido o invalido",
			latitude: input.latitude ?? null,
			longitude: input.longitude ?? null,
			device_fingerprint: input.deviceFingerprint ?? null,
		});
		throw new TRPCError({ code: "BAD_REQUEST", message: "QR vencido o invalido." });
	}

	const employee = await db.query.employees.findFirst({
		where: and(eq(employees.id, input.employeeId), eq(employees.user_uid, token.user_uid)),
	});
	if (!employee || employee.status !== "active") {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Empleado no valido." });
	}

	const settings = await db.query.attendanceSettings.findFirst({
		where: eq(attendanceSettings.user_uid, token.user_uid),
	});
	if (settings?.require_pin && employee.pin_hash !== attendanceHash(input.pin)) {
		await db.insert(attendanceAttempts).values({
			user_uid: token.user_uid,
			employee_id: employee.id,
			token_hash: tokenHash,
			purpose: input.purpose,
			result: "rejected",
			reason: "PIN incorrecto",
			latitude: input.latitude ?? null,
			longitude: input.longitude ?? null,
			device_fingerprint: input.deviceFingerprint ?? null,
		});
		throw new TRPCError({ code: "BAD_REQUEST", message: "PIN incorrecto." });
	}

	let distance: number | null = null;
	if (
		settings?.require_location &&
		settings.latitude != null &&
		settings.longitude != null
	) {
		if (input.latitude == null || input.longitude == null) {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Ubicacion requerida." });
		}
		distance = distanceMeters(
			settings.latitude,
			settings.longitude,
			input.latitude,
			input.longitude,
		);
		if (distance > settings.allowed_radius_meters) {
			await db.insert(attendanceAttempts).values({
				user_uid: token.user_uid,
				employee_id: employee.id,
				token_hash: tokenHash,
				purpose: input.purpose,
				result: "rejected",
				reason: "Fuera del radio permitido",
				latitude: input.latitude,
				longitude: input.longitude,
				distance_meters: distance,
				device_fingerprint: input.deviceFingerprint ?? null,
			});
			throw new TRPCError({ code: "BAD_REQUEST", message: "Fuera del radio permitido." });
		}
	}

	await ensureTodayAssignments(token.user_uid);
	const dateKey = todayKey();
	const assignment = await db.query.employeeShiftAssignments.findFirst({
		where: and(
			eq(employeeShiftAssignments.user_uid, token.user_uid),
			eq(employeeShiftAssignments.employee_id, employee.id),
			eq(employeeShiftAssignments.shift_date, dateKey),
		),
	});
	if (!assignment) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "El empleado no tiene turno hoy." });
	}

	const existing = await db.query.attendanceRecords.findFirst({
		where: eq(attendanceRecords.shift_assignment_id, assignment.id),
	});

	if (input.purpose === "check_in") {
		if (existing?.check_in_at) {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Entrada ya registrada." });
		}
		const late = Math.max(0, minutesDiff(now, assignment.expected_start_at));
		const shift = await db.query.employeeShifts.findFirst({
			where: eq(employeeShifts.id, assignment.shift_id),
		});
		const status = late > (shift?.grace_minutes ?? 10) ? "Tarde" : "A tiempo";
		const values = {
			user_uid: token.user_uid,
			employee_id: employee.id,
			shift_assignment_id: assignment.id,
			check_in_at: now,
			check_in_status: status,
			minutes_late: late,
			qr_token_id: token.id,
			latitude: input.latitude ?? null,
			longitude: input.longitude ?? null,
			distance_meters: distance,
			device_fingerprint: input.deviceFingerprint ?? null,
			updated_at: now,
		};
		if (existing) {
			await db.update(attendanceRecords).set(values).where(eq(attendanceRecords.id, existing.id));
		} else {
			await db.insert(attendanceRecords).values(values);
		}
		return { ok: true, status, minutesLate: late };
	}

	if (!existing?.check_in_at) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Primero registra entrada." });
	}
	if (existing.check_out_at) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Salida ya registrada." });
	}
	const earlyLeave = Math.max(0, minutesDiff(assignment.expected_end_at, now));
	const overtime = Math.max(0, minutesDiff(now, assignment.expected_end_at));
	await db
		.update(attendanceRecords)
		.set({
			check_out_at: now,
			check_out_status: earlyLeave > 0 ? "Salida temprana" : "Salida normal",
			minutes_early_leave: earlyLeave,
			overtime_minutes: overtime,
			updated_at: now,
		})
		.where(eq(attendanceRecords.id, existing.id));
	return { ok: true, status: earlyLeave > 0 ? "Salida temprana" : "Salida normal", overtime };
}
