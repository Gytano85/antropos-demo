import { cameraAssetPath } from "./asset-path";
import type { CocoModelDetection, FrameSize } from "./bar-service-detector";
import { decodeYoloOutput, letterboxTransform } from "./yolo-onnx";

/**
 * Carga y ejecucion de un YOLOv8 ONNX en el navegador.
 *
 * Solo se importa desde el cliente: `onnxruntime-web` toca `window` al
 * resolver las rutas de sus binarios wasm.
 */

export type YoloRuntimeBackend = "webgpu" | "wasm";

export type YoloModelConfig = {
	/** Ruta publica del .onnx, por ejemplo /models/beverage-containers.onnx */
	modelUrl: string;
	/** Debe coincidir con el `names` del data.yaml usado al entrenar. */
	classNames: readonly string[];
	inputSize?: number;
	scoreThreshold?: number;
	iouThreshold?: number;
};

export type YoloSession = {
	backend: YoloRuntimeBackend;
	detect: (
		source: HTMLCanvasElement,
		frame: FrameSize,
		crop?: { x: number; y: number; width: number; height: number },
	) => Promise<CocoModelDetection[]>;
	dispose: () => Promise<void>;
};

const DEFAULT_INPUT_SIZE = 640;
/** Gris estandar de relleno del letterbox de YOLO. */
const PAD_VALUE = 114;

export async function createYoloSession(
	config: YoloModelConfig,
	onBackend?: (backend: YoloRuntimeBackend) => void,
): Promise<YoloSession> {
	const ort = await import("onnxruntime-web");
	// Servimos los binarios wasm desde /public: por defecto ort los baja de un
	// CDN, lo que rompe el detector en una barra sin internet.
	ort.env.wasm.wasmPaths = cameraAssetPath("/ort/");
	const inputSize = config.inputSize ?? DEFAULT_INPUT_SIZE;

	// Una sola llamada con la lista de backends: ORT hace el fallback por dentro.
	// Recorrerlos en un bucle con timeout rompia el arranque, porque un
	// `Promise.race` no cancela la inicializacion perdedora y el segundo intento
	// moria con "multiple calls to 'initWasm()' detected".
	const providers: YoloRuntimeBackend[] = supportsWebGpu()
		? ["webgpu", "wasm"]
		: ["wasm"];

	const session = await ort.InferenceSession.create(config.modelUrl, {
		executionProviders: providers,
		graphOptimizationLevel: "all",
	});
	const backend = providers[0] ?? "wasm";
	onBackend?.(backend);
	return buildSession(ort, session, config, inputSize, backend);
}

function buildSession(
	ort: typeof import("onnxruntime-web"),
	session: import("onnxruntime-web").InferenceSession,
	config: YoloModelConfig,
	inputSize: number,
	backend: YoloRuntimeBackend,
): YoloSession {
	const inputName = session.inputNames[0];
	const outputName = session.outputNames[0];
	if (!inputName || !outputName) {
		throw new Error("El modelo ONNX no expone entradas/salidas utilizables.");
	}

	const workCanvas = document.createElement("canvas");
	workCanvas.width = inputSize;
	workCanvas.height = inputSize;
	const workContext = workCanvas.getContext("2d", { willReadFrequently: true });

	return {
		backend,
		detect: async (source, frame, crop) => {
			if (!workContext || frame.width <= 0 || frame.height <= 0) return [];

			const { scale, padX, padY } = letterboxTransform(frame, inputSize);
			workContext.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
			workContext.fillRect(0, 0, inputSize, inputSize);
			workContext.drawImage(
				source,
				crop?.x ?? 0,
				crop?.y ?? 0,
				crop?.width ?? frame.width,
				crop?.height ?? frame.height,
				padX,
				padY,
				frame.width * scale,
				frame.height * scale,
			);

			const { data } = workContext.getImageData(0, 0, inputSize, inputSize);
			const tensor = new ort.Tensor(
				"float32",
				imageDataToNchw(data, inputSize),
				[1, 3, inputSize, inputSize],
			);

			const results = await session.run({ [inputName]: tensor });
			const output = results[outputName];
			if (!output) return [];

			return decodeYoloOutput(
				output.data as Float32Array,
				output.dims as number[],
				frame,
				inputSize,
				{
					classNames: config.classNames,
					scoreThreshold: config.scoreThreshold,
					iouThreshold: config.iouThreshold,
				},
			);
		},
		dispose: async () => {
			await session.release();
		},
	};
}

/**
 * RGBA intercalado -> NCHW float32 normalizado, que es lo que espera YOLOv8.
 */
export function imageDataToNchw(
	rgba: Uint8ClampedArray,
	inputSize: number,
): Float32Array {
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
	return (
		typeof navigator !== "undefined" &&
		Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
	);
}
