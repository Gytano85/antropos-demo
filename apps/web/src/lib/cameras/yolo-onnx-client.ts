import type { CocoModelDetection, FrameSize } from "./bar-service-detector";
import type { YoloModelConfig, YoloRuntimeBackend } from "./yolo-onnx-runtime";
import type { WorkerResponse } from "./yolo-worker";

/**
 * Cliente del worker de inferencia.
 *
 * Expone la misma forma que la sesion en el hilo principal para que la pagina
 * no tenga que saber donde corre el modelo.
 */

/** Region del frame que se envia al modelo, en pixeles del canvas. */
export type CropRect = { x: number; y: number; width: number; height: number };

export type YoloClient = {
	backend: YoloRuntimeBackend;
	detect: (
		source: CanvasImageSource,
		frame: FrameSize,
		crop?: CropRect,
	) => Promise<CocoModelDetection[]>;
	dispose: () => void;
};

const DEFAULT_INPUT_SIZE = 640;
const INIT_TIMEOUT_MS = 120_000;
const DETECT_TIMEOUT_MS = 20_000;

export function supportsWorkerInference() {
	return (
		typeof Worker !== "undefined" &&
		typeof OffscreenCanvas !== "undefined" &&
		typeof createImageBitmap === "function"
	);
}

/**
 * Punto de entrada del detector: worker cuando el navegador lo permite y, si
 * no, la sesion en el hilo principal (mas lenta, pero funciona en todos lados).
 */
export async function createBarDetector(
	config: YoloModelConfig,
	onBackend?: (backend: YoloRuntimeBackend) => void,
	onProgress?: (percent: number) => void,
): Promise<YoloClient> {
	if (supportsWorkerInference()) {
		try {
			const client = await createYoloWorkerClient(config, onProgress);
			onBackend?.(client.backend);
			return client;
		} catch {
			// El worker puede fallar por CSP o por falta de WebGPU; seguimos
			// en el hilo principal en vez de dejar la camara sin detector.
		}
	}

	const { createYoloSession } = await import("./yolo-onnx-runtime");
	const session = await createYoloSession(config, onBackend);
	return {
		backend: session.backend,
		detect: (source, frame, crop) =>
			session.detect(source as HTMLCanvasElement, frame, crop),
		dispose: () => {
			void session.dispose();
		},
	};
}

export async function createYoloWorkerClient(
	config: YoloModelConfig,
	onProgress?: (percent: number) => void,
): Promise<YoloClient> {
	const worker = new Worker(new URL("./yolo-worker.ts", import.meta.url), {
		type: "module",
	});

	const pending = new Map<
		number,
		{
			resolve: (detections: CocoModelDetection[]) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	let nextId = 0;
	let disposed = false;

	const backend = await new Promise<YoloRuntimeBackend>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("El detector tardo demasiado en iniciar."));
		}, INIT_TIMEOUT_MS);

		const onInit = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			if (message.type === "progress") {
				onProgress?.(message.percent);
				return;
			}
			if (message.type === "ready") {
				clearTimeout(timer);
				worker.removeEventListener("message", onInit);
				resolve(message.backend);
				return;
			}
			if (message.type === "error" && message.id === undefined) {
				clearTimeout(timer);
				worker.removeEventListener("message", onInit);
				reject(new Error(message.message));
			}
		};

		worker.addEventListener("message", onInit);
		worker.addEventListener("error", (event) => {
			clearTimeout(timer);
			reject(new Error(event.message || "El worker del detector fallo."));
		});

		worker.postMessage({
			type: "init",
			modelUrl: config.modelUrl,
			classNames: [...config.classNames],
			inputSize: config.inputSize ?? DEFAULT_INPUT_SIZE,
			scoreThreshold: config.scoreThreshold,
			iouThreshold: config.iouThreshold,
		});
	}).catch((error) => {
		worker.terminate();
		throw error;
	});

	worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		if (message.type === "result") {
			const entry = pending.get(message.id);
			if (!entry) return;
			pending.delete(message.id);
			clearTimeout(entry.timer);
			entry.resolve(message.detections);
			return;
		}
		if (message.type === "error" && message.id !== undefined) {
			const entry = pending.get(message.id);
			if (!entry) return;
			pending.delete(message.id);
			clearTimeout(entry.timer);
			entry.reject(new Error(message.message));
		}
	});

	return {
		backend,
		detect: async (source, frame, crop) => {
			if (disposed) return [];
			if (frame.width <= 0 || frame.height <= 0) return [];

			// Recortar aqui hace que el objeto ocupe muchos mas pixeles del
			// cuadro que ve el modelo. El bitmap se transfiere sin copiar y el
			// worker lo cierra.
			const bitmap = crop
				? await createImageBitmap(
						source,
						crop.x,
						crop.y,
						crop.width,
						crop.height,
					)
				: await createImageBitmap(source);
			const id = nextId++;

			return new Promise<CocoModelDetection[]>((resolve, reject) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error("La inferencia tardo demasiado."));
				}, DETECT_TIMEOUT_MS);

				pending.set(id, { resolve, reject, timer });
				worker.postMessage({ type: "detect", id, bitmap, frame }, [bitmap]);
			});
		},
		dispose: () => {
			disposed = true;
			for (const entry of pending.values()) {
				clearTimeout(entry.timer);
				entry.resolve([]);
			}
			pending.clear();
			worker.terminate();
		},
	};
}
