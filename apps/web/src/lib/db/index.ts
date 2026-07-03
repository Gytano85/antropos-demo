import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const globalForPGlite = globalThis as unknown as {
  pglite: PGlite | undefined;
  pgPool: pg.Pool | undefined;
};

function resolveDataDir() {
  if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
  if (!process.env.VERCEL) return "./data/pglite";

  const deploymentKey =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    "current";
  const target = `/tmp/antropos-demo-pglite-${deploymentKey}`;
  const bundledSeedCandidates = [
    join(process.cwd(), "demo-data", "pglite"),
    join(process.cwd(), "apps", "web", "demo-data", "pglite"),
    join(process.cwd(), ".next", "standalone", "apps", "web", "demo-data", "pglite"),
  ];
  const bundledSeed = bundledSeedCandidates.find((path) => existsSync(path));

  if (!existsSync(target) && bundledSeed) {
    mkdirSync("/tmp", { recursive: true });
    cpSync(bundledSeed, target, { recursive: true });
  }

  return target;
}

function createDb() {
  if (process.env.DATABASE_URL) {
    const pool =
      globalForPGlite.pgPool ??
      new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
      });

    globalForPGlite.pgPool = pool;
    return drizzleNodePostgres(pool, { schema });
  }

  const dataDir = resolveDataDir();
  mkdirSync(dataDir, { recursive: true });
  const pglite = globalForPGlite.pglite ?? new PGlite(dataDir);

  globalForPGlite.pglite = pglite;
  return drizzlePglite({ client: pglite, schema });
}

export const db = createDb();
