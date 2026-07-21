import type { CocoModelDetection, FrameSize } from "./bar-service-detector";
import type { BoundingBox } from "./bar-service-tracker";

/**
 * Decodificacion de salidas YOLOv8 exportadas a ONNX.
 *
 * El modelo se define por su lista de clases, no por codigo: cambiar de un
 * YOLO COCO al modelo de bebidas es reemplazar el .onnx y `classNames`.
 */

export type LetterboxTransform = {
	scale: number;
	padX: number;
	padY: number;
};

export type YoloDecodeOptions = {
	classNames: readonly string[];
	scoreThreshold?: number;
	iouThreshold?: number;
	maxDetections?: number;
};

const DEFAULT_SCORE_THRESHOLD = 0.25;
const DEFAULT_IOU_THRESHOLD = 0.45;
const DEFAULT_MAX_DETECTIONS = 60;

/**
 * Calcula el redimensionado con letterbox (mantiene proporcion y centra con
 * relleno). Es el preprocesamiento que espera YOLOv8.
 */
export function letterboxTransform(
	frame: FrameSize,
	inputSize: number,
): LetterboxTransform {
	if (frame.width <= 0 || frame.height <= 0) {
		return { scale: 1, padX: 0, padY: 0 };
	}
	const scale = Math.min(inputSize / frame.width, inputSize / frame.height);
	const drawWidth = frame.width * scale;
	const drawHeight = frame.height * scale;
	return {
		scale,
		padX: (inputSize - drawWidth) / 2,
		padY: (inputSize - drawHeight) / 2,
	};
}

/**
 * Convierte el tensor crudo [1, 4 + numClases, numAnclas] en detecciones sobre
 * las coordenadas del frame original.
 */
export function decodeYoloOutput(
	output: ArrayLike<number>,
	dims: readonly number[],
	frame: FrameSize,
	inputSize: number,
	options: YoloDecodeOptions,
): CocoModelDetection[] {
	const { classNames } = options;
	const scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
	const iouThreshold = options.iouThreshold ?? DEFAULT_IOU_THRESHOLD;
	const maxDetections = options.maxDetections ?? DEFAULT_MAX_DETECTIONS;

	const channels = dims[1] ?? 0;
	const anchors = dims[2] ?? 0;
	if (channels < 5 || anchors <= 0) return [];
	// El resto de canales tras cx, cy, w, h es un score por clase.
	const classCount = Math.min(channels - 4, classNames.length);
	if (classCount <= 0) return [];

	const transform = letterboxTransform(frame, inputSize);
	if (transform.scale <= 0) return [];

	const detections: CocoModelDetection[] = [];

	for (let anchor = 0; anchor < anchors; anchor += 1) {
		let bestScore = 0;
		let bestClass = -1;
		for (let index = 0; index < classCount; index += 1) {
			const score = output[(4 + index) * anchors + anchor] ?? 0;
			if (score > bestScore) {
				bestScore = score;
				bestClass = index;
			}
		}
		if (bestClass < 0 || bestScore < scoreThreshold) continue;

		const centerX = output[anchor] ?? 0;
		const centerY = output[anchors + anchor] ?? 0;
		const width = output[2 * anchors + anchor] ?? 0;
		const height = output[3 * anchors + anchor] ?? 0;
		if (width <= 0 || height <= 0) continue;

		const bbox = undoLetterbox(
			[centerX - width / 2, centerY - height / 2, width, height],
			transform,
		);
		const clamped = clampToFrame(bbox, frame);
		if (!clamped) continue;

		detections.push({
			class: classNames[bestClass] ?? String(bestClass),
			score: bestScore,
			bbox: clamped,
		});
	}

	return nonMaxSuppression(detections, iouThreshold).slice(0, maxDetections);
}

/**
 * NMS por clase: dos objetos distintos que se solapan solo compiten si el
 * modelo les asigno la misma etiqueta.
 */
export function nonMaxSuppression(
	detections: CocoModelDetection[],
	iouThreshold: number,
): CocoModelDetection[] {
	const sorted = [...detections].sort((a, b) => b.score - a.score);
	const kept: CocoModelDetection[] = [];
	for (const detection of sorted) {
		const overlaps = kept.some(
			(current) =>
				current.class === detection.class &&
				intersectionOverUnion(current.bbox, detection.bbox) >= iouThreshold,
		);
		if (!overlaps) kept.push(detection);
	}
	return kept;
}

function undoLetterbox(
	[x, y, width, height]: BoundingBox,
	{ scale, padX, padY }: LetterboxTransform,
): BoundingBox {
	return [
		(x - padX) / scale,
		(y - padY) / scale,
		width / scale,
		height / scale,
	];
}

function clampToFrame(
	[x, y, width, height]: BoundingBox,
	frame: FrameSize,
): BoundingBox | null {
	const left = Math.max(0, x);
	const top = Math.max(0, y);
	const right = Math.min(frame.width, x + width);
	const bottom = Math.min(frame.height, y + height);
	if (right - left < 1 || bottom - top < 1) return null;
	return [left, top, right - left, bottom - top];
}

function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const union = a[2] * a[3] + b[2] * b[3] - intersection;
	return intersection / Math.max(1, union);
}
