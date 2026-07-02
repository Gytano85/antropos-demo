#!/usr/bin/env tsx
import { seed } from "../src/lib/db/seed";

if (process.env.VERCEL && !process.env.DEMO_LIGHT_SEED) {
	process.env.DEMO_LIGHT_SEED = "1";
}

if (!process.env.VERCEL && !process.env.DATABASE_URL) {
	console.log("Seed omitido: solo se ejecuta en Vercel o con DATABASE_URL.");
	process.exit(0);
}

seed()
	.then(() => {
		console.log("Seed listo.");
		process.exit(0);
	})
	.catch((err) => {
		console.error("Error al sembrar datos demo:", err);
		process.exit(1);
	});
