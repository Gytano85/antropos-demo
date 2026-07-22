/// <reference lib="webworker" />
import { cameraAssetPath } from "./asset-path";
import type { CocoModelDetection, FrameSize } from "./bar-service-detector";
import { decodeYoloOutput, letterboxTransform } from "./yolo-onnx";

/**
 * Inferencia YOLOv8 fuera del hilo principal.
 *
 * Correr el modelo en el hilo de la UI congelaba el video y el overlay 200-400ms
 * por pasada; ese bloqueo era la causa del retraso visible y, de rebote, de que
 * el emparejamiento de tracks fallara y se duplicaran objetos.
 */

export type WorkerInitMessage = {
	type: "init";
	modelUrl: string;
	classNames: string[];
	inputSize: number;
	scoreThreshold?: number;
	iouThreshold?: number;
};

export type WorkerDetectMessage = {
	type: "detect";
	id: number;
	bitmap: ImageBitmap;
	frame: FrameSize;
};

export type WorkerRequest = WorkerInitMessage | WorkerDetectMessage;

export type WorkerResponse =
	| { type: "progress"; percent: number }
	| { type: "ready"; backend: "webgpu" | "wasm" }
	| { type: "result"; id: number; detections: CocoModelDetection[] }
	| { type: "error"; id?: number; message: string };

const PAD_VALUE = 114;
/** Corte si la descarga deja de avanzar (no si simplemente va lenta). */
const WEIGHTS_STALL_TIMEOUT_MS = 20_000;
const BACKEND_INIT_TIMEOUT_MS: Record<"webgpu" | "wasm", number> = {
	webgpu: 12_000,
	wasm: 60_000,
};

type Runtime = {
	ort: typeof import("onnxruntime-web");
	session: import("onnxruntime-web").InferenceSession;
	inputName: string;
	outputName: string;
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	config: WorkerInitMessage;
};

let runtime: Runtime | null = null;

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	const message = event.data;
	if (message.type === "init") {
		void initialise(message);
		return;
	}
	if (message.type === "detect") {
		void detect(message);
	}
});

async function initialise(config: WorkerInitMessage) {
	try {
		const ort = await import("onnxruntime-web");
		ort.env.wasm.wasmPaths = cameraAssetPath("/ort/");

		const backends: Array<"webgpu" | "wasm"> = supportsWebGpu()
			? ["webgpu", "wasm"]
			: ["wasm"];

		// Descargamos los pesos aparte para poder reportar avance real: antes la
		// barra se quedaba clavada en un porcentaje fijo mientras bajaban ~13 MB
		// y parecia colgada.
		const weights = await fetchWeights(config.modelUrl);

		const errors: string[] = [];
		for (const backend of backends) {
			try {
				const session = await createSessionWithTimeout(ort, weights, backend);
				const inputName = session.inputNames[0];
				const outputName = session.outputNames[0];
				if (!inputName || !outputName) {
					throw new Error("El modelo no expone entradas/salidas utilizables.");
				}
				const canvas = new OffscreenCanvas(config.inputSize, config.inputSize);
				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (!context) throw new Error("Sin contexto 2D en el worker.");

				runtime = {
					ort,
					session,
					inputName,
					outputName,
					canvas,
					context,
					config,
				};
				post({ type: "ready", backend });
				return;
			} catch (error) {
				errors.push(`${backend}: ${describe(error)}`);
			}
		}
		post({
			type: "error",
			message: `No se pudo iniciar el detector (${errors.join(" | ")})`,
		});
	} catch (error) {
		post({ type: "error", message: describe(error) });
	}
}

async function detect({ id, bitmap, frame }: WorkerDetectMessage) {
	if (!runtime) {
		bitmap.close();
		post({ type: "error", id, message: "El detector aun no esta listo." });
		return;
	}

	const { ort, session, inputName, outputName, context, config } = runtime;
	const inputSize = config.inputSize;

	try {
		const { scale, padX, padY } = letterboxTransform(frame, inputSize);
		context.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
		context.fillRect(0, 0, inputSize, inputSize);
		context.drawImage(
			bitmap,
			0,
			0,
			frame.width,
			frame.height,
			padX,
			padY,
			frame.width * scale,
			frame.height * scale,
		);

		const { data } = context.getImageData(0, 0, inputSize, inputSize);
		const tensor = new ort.Tensor("float32", toNchw(data, inputSize), [
			1,
			3,
			inputSize,
			inputSize,
		]);

		const results = await session.run({ [inputName]: tensor });
		const output = results[outputName];
		if (!output) {
			post({ type: "result", id, detections: [] });
			return;
		}

		post({
			type: "result",
			id,
			detections: decodeYoloOutput(
				output.data as Float32Array,
				output.dims as number[],
				frame,
				inputSize,
				{
					classNames: config.classNames,
					scoreThreshold: config.scoreThreshold,
					iouThreshold: config.iouThreshold,
				},
			),
		});
	} catch (error) {
		post({ type: "error", id, message: describe(error) });
	} finally {
		bitmap.close();
	}
}

/**
 * Baja los pesos informando avance. Si el servidor no manda `Content-Length`
 * caemos a una lectura simple: sin total no hay porcentaje que reportar.
 */
async function fetchWeights(modelUrl: string): Promise<Uint8Array> {
	// Sin corte, una red que se traba a mitad de la descarga deja el detector
	// "preparando" para siempre. El reloj se reinicia con cada trozo recibido,
	// asi que una conexion lenta pero viva no se cancela.
	const controller = new AbortController();
	let stallTimer = setTimeout(
		() => controller.abort(),
		WEIGHTS_STALL_TIMEOUT_MS,
	);
	const keepAlive = () => {
		clearTimeout(stallTimer);
		stallTimer = setTimeout(() => controller.abort(), WEIGHTS_STALL_TIMEOUT_MS);
	};

	let response: Response;
	try {
		response = await fetch(modelUrl, { signal: controller.signal });
	} catch (error) {
		clearTimeout(stallTimer);
		throw controller.signal.aborted
			? new Error("La descarga del modelo se quedo sin respuesta.")
			: error;
	}
	if (!response.ok) {
		clearTimeout(stallTimer);
		throw new Error(`No se pudo descargar el modelo (HTTP ${response.status})`);
	}
	const total = Number(response.headers.get("content-length") ?? 0);
	if (!response.body || !Number.isFinite(total) || total <= 0) {
		try {
			return new Uint8Array(await response.arrayBuffer());
		} finally {
			clearTimeout(stallTimer);
		}
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	let lastReported = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		keepAlive();
		chunks.push(value);
		received += value.length;
		// 40..85 %: el tramo que la UI reserva para la descarga.
		const percent = 40 + Math.round((received / total) * 45);
		if (percent - lastReported >= 2) {
			lastReported = percent;
			post({ type: "progress", percent });
		}
	}

	clearTimeout(stallTimer);
	const weights = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		weights.set(chunk, offset);
		offset += chunk.length;
	}
	post({ type: "progress", percent: 88 });
	return weights;
}

async function createSessionWithTimeout(
	ort: typeof import("onnxruntime-web"),
	weights: Uint8Array,
	backend: "webgpu" | "wasm",
) {
	return await Promise.race([
		ort.InferenceSession.create(weights, {
			executionProviders: [backend],
			graphOptimizationLevel: "all",
		}),
		new Promise<never>((_, reject) => {
			setTimeout(
				() =>
					reject(
						new Error(
							`Timeout iniciando ${backend}; se probara el siguiente backend.`,
						),
					),
				BACKEND_INIT_TIMEOUT_MS[backend],
			);
		}),
	]);
}

function toNchw(rgba: Uint8ClampedArray, inputSize: number) {
	const pixels = inputSize * inputSize;
	const tensor = new Float32Array(pixels * 3);
	for (let index = 0; index < pixels; index += 1) {
		const offset = index * 4;
		tensor[index] = (rgba[offset] ?? 0) / 255;
		tensor[pixels + index] = (rgba[offset + 1] ?? 0) / 255;
		tensor[2 * pixels + index] = (rgba[offset + 2] ?? 0) / 255;
	}
	return tensor;
}

function supportsWebGpu() {
	return Boolean((scope.navigator as Navigator & { gpu?: unknown }).gpu);
}

function describe(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function post(message: WorkerResponse) {
	scope.postMessage(message);
}
