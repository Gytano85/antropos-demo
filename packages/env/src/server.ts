import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(1).default("dev-secret-key-change-in-production"),
    BASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// En Vercel, VERCEL_URL trae el dominio del deploy automáticamente
// (sin protocolo), así no hace falta configurar BASE_URL a mano para un
// deploy de una sola zona (sin landing separado bajo /app).
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
const base = (env.BASE_URL ?? vercelUrl ?? "http://localhost").replace(/\/$/, "");
const isDev = base === "http://localhost";

export const serverUrls = {
  betterAuthUrl: isDev ? "http://localhost:3001" : base,
  landingUrl: isDev ? undefined : base,
} as const;
