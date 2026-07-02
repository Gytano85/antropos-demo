import { existsSync, mkdirSync, rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const DATA_DIR = process.env.PGLITE_DATA_DIR || "./data/pglite";

async function main() {
  if (process.env.DATABASE_URL) {
    return;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    return;
  }

  try {
    const pg = new PGlite(DATA_DIR);
    await pg.query("SELECT 1");
    await pg.close();
  } catch {
    console.warn("⚠ PGLite corrompido — limpando para recriação automática...");
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

main();
