#!/usr/bin/env bun
import { seed } from "../src/lib/db/seed";

seed()
	.then(() => {
		console.log("Seed listo.");
		process.exit(0);
	})
	.catch((err) => {
		console.error("Error al sembrar datos demo:", err);
		process.exit(1);
	});
