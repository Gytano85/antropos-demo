import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

const globalForPGlite = globalThis as unknown as {
  pglite: PGlite | undefined;
};

function resolveDataDir() {
  if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
  if (!process.env.VERCEL) return "./data/pglite";

  const target = "/tmp/antropos-demo-pglite";
  const bundledSeed = join(process.cwd(), "demo-data", "pglite");

  if (!existsSync(target) && existsSync(bundledSeed)) {
    mkdirSync("/tmp", { recursive: true });
    cpSync(bundledSeed, target, { recursive: true });
  }

  return target;
}

const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });

export const pglite = globalForPGlite.pglite ?? new PGlite(dataDir);

globalForPGlite.pglite = pglite;

export const db = drizzle({ client: pglite, schema });
