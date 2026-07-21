import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
	const sessionCookie = getSessionCookie(request);
	const demoSessionCookie = request.cookies.get("antropos_demo_session")?.value;
	const { pathname } = request.nextUrl;

	if (
		!sessionCookie &&
		demoSessionCookie !== "1" &&
		!pathname.startsWith("/login") &&
		!pathname.startsWith("/signup") &&
		!pathname.startsWith("/menu") &&
		!pathname.startsWith("/demo-health") &&
		!pathname.startsWith("/employee-checkin") &&
		!pathname.startsWith("/auth") &&
		!pathname.startsWith("/api/attendance") &&
		!pathname.startsWith("/api/alcohol-control/scale-readings") &&
		!pathname.startsWith("/api/cameras") &&
		!pathname.startsWith("/api/auth") &&
		!pathname.startsWith("/api/demo-health") &&
		!pathname.startsWith("/api/docs") &&
		!pathname.startsWith("/api/openapi.json") &&
		!pathname.startsWith("/api/vision-ops/signals") &&
		!pathname.startsWith("/api/trpc")
	) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		// `models` y `ort` son binarios estaticos del detector de camara: no
		// necesitan sesion y son demasiado pesados para pasar por el middleware.
		"/((?!_next/static|_next/image|favicon.ico|models/|ort/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
