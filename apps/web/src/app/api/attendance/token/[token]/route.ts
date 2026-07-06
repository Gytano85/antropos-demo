import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
	attendanceQrTokens,
	attendanceSettings,
	employees,
} from "@/lib/db/schema";
import { attendanceHash } from "@/lib/trpc/routers/attendance";
import { ensureAttendanceTables } from "@/lib/trpc/routers/attendance";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	await ensureAttendanceTables();
	const now = new Date();
	const row = await db.query.attendanceQrTokens.findFirst({
		where: and(
			eq(attendanceQrTokens.token_hash, attendanceHash(token)),
			lte(attendanceQrTokens.valid_from, now),
			gte(attendanceQrTokens.expires_at, now),
		),
	});

	if (!row) {
		return NextResponse.json(
			{ ok: false, message: "QR vencido o invalido." },
			{ status: 404 },
		);
	}

	const [staff, settings] = await Promise.all([
		db
			.select({
				id: employees.id,
				name: employees.name,
				role: employees.role,
			})
			.from(employees)
			.where(and(eq(employees.user_uid, row.user_uid), eq(employees.status, "active"))),
		db.query.attendanceSettings.findFirst({
			where: eq(attendanceSettings.user_uid, row.user_uid),
		}),
	]);

	return NextResponse.json({
		ok: true,
		purpose: row.purpose,
		expiresAt: row.expires_at,
		employees: staff,
		settings: settings
			? {
					requireLocation: settings.require_location,
					requirePin: settings.require_pin,
					allowedRadiusMeters: settings.allowed_radius_meters,
					locationName: settings.location_name,
				}
			: null,
	});
}
