import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { submitAttendance } from "@/lib/trpc/routers/attendance";

const inputSchema = z.object({
	token: z.string().min(10),
	purpose: z.enum(["check_in", "check_out"]),
	employeeId: z.number().int(),
	pin: z.string().min(4),
	latitude: z.number().optional().nullable(),
	longitude: z.number().optional().nullable(),
	deviceFingerprint: z.string().optional().nullable(),
});

export async function POST(request: Request) {
	try {
		const input = inputSchema.parse(await request.json());
		const result = await submitAttendance(input);
		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "No se pudo registrar asistencia.";
		return NextResponse.json({ ok: false, message }, { status: 400 });
	}
}
