import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

const globalForPGlite = globalThis as unknown as {
  pglite: PGlite | undefined;
};

const dataDir = process.env.PGLITE_DATA_DIR || "./data/pglite";
mkdirSync(dataDir, { recursive: true });

export const pglite = globalForPGlite.pglite ?? new PGlite(dataDir);

globalForPGlite.pglite = pglite;

export const db = drizzle({ client: pglite, schema });
