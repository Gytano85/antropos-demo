import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(1).default("dev-secret-key-change-in-production"),
    BETTER_AUTH_URL: z.string().url().optional(),
    BASE_URL: z.string().url().default("http://localhost"),
    CORS_ORIGIN: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    VERCEL_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

const base = env.BASE_URL.replace(/\/$/, "");
const isDev = base === "http://localhost";
const vercelUrl = env.VERCEL_URL ? `https://${env.VERCEL_URL.replace(/\/$/, "")}` : undefined;
const publicBase = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? vercelUrl ?? base;

export const serverUrls = {
  betterAuthUrl: isDev ? "http://localhost:3001" : publicBase,
  landingUrl: isDev ? undefined : publicBase,
} as const;
