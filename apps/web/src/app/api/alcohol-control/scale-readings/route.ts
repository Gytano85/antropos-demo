import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createCallerFactory } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/router";
import { ensureAlcoholControlTables } from "@/lib/trpc/routers/alcohol-control";

const DEMO_EMAIL = "test@example.com";
const DEV_TOKEN = "dev-scale-token";

const payloadSchema = z.object({
	bottleId: z.number().optional(),
	scaleKey: z.string().min(1).max(120).optional(),
	weightG: z.number().min(1).max(10000),
	expectedUsedMl: z.number().min(0).max(5000).optional(),
});

type ScaleLookupRow = {
	id: number;
};

type QueryResult<T> = T[] | { rows?: T[] };

function rows<T>(result: QueryResult<T>) {
	return Array.isArray(result) ? result : (result.rows ?? []);
}

export async function POST(request: Request) {
	const expectedToken =
		process.env.ALCOHOL_SCALE_INGEST_TOKEN ||
		(process.env.NODE_ENV !== "production" ? DEV_TOKEN : null);
	const providedToken = request.headers.get("x-scale-token");

	if (!expectedToken || providedToken !== expectedToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	if (!parsed.data.bottleId && !parsed.data.scaleKey) {
		return NextResponse.json(
			{ error: "Send bottleId or scaleKey" },
			{ status: 400 },
		);
	}

	const demoUser = await db.query.user.findFirst({
		where: eq(user.email, DEMO_EMAIL),
	});

	if (!demoUser) {
		return NextResponse.json({ error: "Demo user not found" }, { status: 404 });
	}

	await ensureAlcoholControlTables();
	let bottleId = parsed.data.bottleId;
	if (!bottleId && parsed.data.scaleKey) {
		const found = rows<ScaleLookupRow>(
			await db.execute(sql`
				SELECT id FROM bottle_scales
				WHERE user_uid = ${demoUser.id} AND scale_key = ${parsed.data.scaleKey}
				LIMIT 1
			`),
		)[0];
		bottleId = found?.id;
	}

	if (!bottleId) {
		return NextResponse.json({ error: "Scale not found" }, { status: 404 });
	}

	const caller = createCallerFactory(appRouter)({
		user: {
			id: demoUser.id,
			email: demoUser.email,
			name: demoUser.name,
		},
	});

	const result = await caller.alcoholControl.recordReading({
		bottleId,
		weightG: parsed.data.weightG,
		expectedUsedMl: parsed.data.expectedUsedMl,
	});

	return NextResponse.json(result);
}
