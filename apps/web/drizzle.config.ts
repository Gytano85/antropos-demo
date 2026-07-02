import { defineConfig } from "drizzle-kit";

export default defineConfig(
  process.env.DATABASE_URL
    ? {
        dialect: "postgresql",
        schema: "./src/lib/db/schema.ts",
        dbCredentials: {
          url: process.env.DATABASE_URL,
        },
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/lib/db/schema.ts",
        dbCredentials: {
          url: process.env.PGLITE_DATA_DIR || "./data/pglite",
        },
      },
);
