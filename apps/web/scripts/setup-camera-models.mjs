#!/usr/bin/env node
/**
 * Prepara los binarios que necesita el detector de barra en /public.
 *
 * Se mantienen fuera de git porque pesan ~52 MB y son reproducibles: los wasm
 * salen de node_modules y el modelo base se descarga una sola vez.
 */
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ortDist = join(appRoot, "node_modules", "onnxruntime-web", "dist");
const ortPublic = join(appRoot, "public", "ort");
const modelsPublic = join(appRoot, "public", "models");

const ORT_FILES = [
	"ort-wasm-simd-threaded.wasm",
	"ort-wasm-simd-threaded.mjs",
	"ort-wasm-simd-threaded.jsep.wasm",
	"ort-wasm-simd-threaded.jsep.mjs",
];

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
	if (!(await exists(ortDist))) {
		throw new Error(
			"No se encontro onnxruntime-web en node_modules. Instala dependencias primero.",
		);
	}
	await mkdir(ortPublic, { recursive: true });
	for (const file of ORT_FILES) {
		await copyFile(join(ortDist, file), join(ortPublic, file));
	}
	console.log(`✓ Runtime ONNX copiado a public/ort (${ORT_FILES.length} archivos)`);
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
