import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

type DrizzleDb = Parameters<typeof drizzleAdapter>[0];

interface AuthOptions {
  db: DrizzleDb;
  baseURL?: string;
  secret?: string;
  trustedOrigins?: string[];
}

export function createAuth({ db, baseURL, secret, trustedOrigins }: AuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: "pg" }),
    emailAndPassword: { enabled: true },
    trustedOrigins,
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
