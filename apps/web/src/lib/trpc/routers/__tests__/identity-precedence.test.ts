import { describe, expect, it, mock } from "bun:test";

/**
 * Precedencia de identidad: una sesión iniciada explícitamente tiene que ganarle
 * a la cookie de demostración.
 *
 * Al revés, entrar con otra cuenta no surtía efecto: la cookie sobrevivía a un
 * acceso previo como propietario y toda petición se resolvía como ese usuario,
 * así que un mesero veía todos los módulos y las dos sucursales.
 */

const demoUser = {
	id: "demo-owner",
	name: "Test User",
	email: "test@example.com",
};
const realUser = {
	id: "waiter-1",
	name: "Mesero Norte",
	email: "mesero@example.com",
};

let cookieValue: string | undefined;
let sessionUser: typeof realUser | null = null;

mock.module("next/headers", () => ({
	cookies: async () => ({
		get: (name: string) =>
			name === "antropos_demo_session" && cookieValue
				? { value: cookieValue }
				: undefined,
	}),
	headers: async () => new Headers(),
}));

mock.module("@/lib/auth", () => ({
	auth: {
		api: {
			getSession: async () => (sessionUser ? { user: sessionUser } : null),
		},
	},
}));

mock.module("@/lib/db", () => ({
	db: {
		query: {
			user: { findFirst: async () => demoUser },
			branchMemberships: { findFirst: async () => undefined },
		},
	},
}));

const { getIdentityUser } = await import("../../../auth-guard");

describe("identity precedence", () => {
	it("prefers the signed-in account over a stale demo cookie", async () => {
		cookieValue = "1";
		sessionUser = realUser;

		const identity = await getIdentityUser();
		expect(identity?.email).toBe("mesero@example.com");
	});

	it("falls back to the demo user when nobody is signed in", async () => {
		cookieValue = "1";
		sessionUser = null;

		const identity = await getIdentityUser();
		expect(identity?.email).toBe("test@example.com");
	});

	it("returns nobody without a session and without the cookie", async () => {
		cookieValue = undefined;
		sessionUser = null;

		expect(await getIdentityUser()).toBeNull();
	});
});
