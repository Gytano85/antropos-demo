import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required. Set it in your .env file.");
}

export const db = drizzle(process.env.DATABASE_URL, { schema });
