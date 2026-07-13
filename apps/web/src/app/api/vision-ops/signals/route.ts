import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createCallerFactory } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/router";

const DEMO_EMAIL = "test@example.com";
const DEV_TOKEN = "dev-demo-token";

export async function POST(request: Request) {
	const expectedToken =
		process.env.VISION_OPS_INGEST_TOKEN ||
		(process.env.NODE_ENV !== "production" ? DEV_TOKEN : null);
	const providedToken = request.headers.get("x-vision-ops-token");

	if (!expectedToken || providedToken !== expectedToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const demoUser = await db.query.user.findFirst({
		where: eq(user.email, DEMO_EMAIL),
	});

	if (!demoUser) {
		return NextResponse.json({ error: "Demo user not found" }, { status: 404 });
	}

	const body = await request.json();
	const caller = createCallerFactory(appRouter)({
		user: {
			id: demoUser.id,
			email: demoUser.email,
			name: demoUser.name,
		},
	});

	if ("session" in body) {
		const sessionResult = await caller.visionOps.recordTrackSession(body);
		return NextResponse.json(sessionResult);
	}

	const result = await caller.visionOps.recordSignal(body);
	return NextResponse.json(result);
}
