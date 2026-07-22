#!/usr/bin/env node
/**
 * Prepara los binarios que necesita el detector de barra en /public.
 *
 * Se mantienen fuera de git porque pesan ~52 MB y son reproducibles: los wasm
 * salen de node_modules y el modelo base se descarga una sola vez.
 */
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "..", "..");
const ortDistCandidates = [
	join(appRoot, "node_modules", "onnxruntime-web", "dist"),
	join(repoRoot, "node_modules", "onnxruntime-web", "dist"),
];
const ortPublic = join(appRoot, "public", "ort");
const modelsPublic = join(appRoot, "public", "models");

/**
 * Todos los binarios `ort-wasm-*`, no solo los que parecen necesarios: ORT
 * resuelve cual cargar en tiempo de ejecucion y pide `asyncify` aunque se use
 * el backend simple. Copiar un subconjunto dejaba el backend WASM inservible
 * con "Failed to fetch dynamically imported module".
 */
const ORT_FILE_PATTERN = /^ort-wasm-.*\.(wasm|mjs)$/;

const BASE_MODEL = {
	file: "yolov8n.onnx",
	url: "https://huggingface.co/cabelo/yolov8/resolve/main/yolov8n.onnx",
};

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function copyOrtRuntime() {
	const ortDist = await firstExistingPath(ortDistCandidates);
	if (!ortDist) {
		throw new Error(
			"No se encontro onnxruntime-web en node_modules. Instala dependencias primero.",
		);
	}
	await mkdir(ortPublic, { recursive: true });
	const files = (await readdir(ortDist)).filter((file) =>
		ORT_FILE_PATTERN.test(file),
	);
	if (files.length === 0) {
		throw new Error("No se encontraron binarios ort-wasm-* en node_modules.");
	}
	for (const file of files) {
		await copyFile(join(ortDist, file), join(ortPublic, file));
	}
	console.log(`✓ Runtime ONNX copiado a public/ort (${files.length} archivos)`);
}

async function firstExistingPath(paths) {
	for (const path of paths) {
		if (await exists(path)) return path;
	}
	return null;
}

async function downloadBaseModel() {
	await mkdir(modelsPublic, { recursive: true });
	const target = join(modelsPublic, BASE_MODEL.file);
	if (await exists(target)) {
		console.log(`✓ ${BASE_MODEL.file} ya existe, se omite la descarga`);
		return;
	}
	console.log(`… descargando ${BASE_MODEL.file}`);
	const response = await fetch(BASE_MODEL.url);
	if (!response.ok || !response.body) {
		throw new Error(`Descarga fallida (HTTP ${response.status})`);
	}
	await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
	console.log(`✓ ${BASE_MODEL.file} descargado`);
}

await copyOrtRuntime();
await downloadBaseModel();
console.log(
	"\nListo. Para el modelo especializado copia beverage-containers.onnx en public/models\n(ver docs/camera-bar-counting.md).",
);
