#!/usr/bin/env tsx

if (process.env.VERCEL && !process.env.DEMO_LIGHT_SEED) {
	process.env.DEMO_LIGHT_SEED = "1";
}

if (!process.env.DATABASE_URL) {
	console.log("Seed omitido: no hay DATABASE_URL; se usará la base demo embebida.");
	process.exit(0);
}

async function main() {
	const { seed } = await import("../src/lib/db/seed");
	await seed();
}

main()
	.then(() => {
		console.log("Seed listo.");
		process.exit(0);
	})
	.catch((err) => {
		console.warn("Seed demo omitido por error no fatal:", err);
		process.exit(0);
	});
