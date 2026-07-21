import { describe, expect, it } from "bun:test";
import { BEVERAGE_MODEL_CLASSES } from "../../../cameras/bar-service-detector";
import {
	decodeYoloOutput,
	letterboxTransform,
	nonMaxSuppression,
} from "../../../cameras/yolo-onnx";
import { imageDataToNchw } from "../../../cameras/yolo-onnx-runtime";

const INPUT_SIZE = 640;
const frame = { width: 1280, height: 720 };

describe("letterbox transform", () => {
	it("centres a 16:9 frame inside a square input", () => {
		const transform = letterboxTransform(frame, INPUT_SIZE);
		expect(transform.scale).toBeCloseTo(0.5, 6);
		expect(transform.padX).toBeCloseTo(0, 6);
		expect(transform.padY).toBeCloseTo(140, 6);
	});

	it("stays neutral for a degenerate frame", () => {
		const transform = letterboxTransform({ width: 0, height: 0 }, INPUT_SIZE);
		expect(transform).toEqual({ scale: 1, padX: 0, padY: 0 });
	});
});

describe("YOLOv8 ONNX output decoding", () => {
	it("maps a detection back to original frame coordinates", () => {
		const { data, dims } = buildOutput([
			{
				centerX: 320,
				centerY: 320,
				width: 100,
				height: 50,
				classIndex: 8,
				score: 0.9,
			},
		]);

		const detections = decodeYoloOutput(data, dims, frame, INPUT_SIZE, {
			classNames: BEVERAGE_MODEL_CLASSES,
		});

		expect(detections).toHaveLength(1);
		expect(detections[0]?.class).toBe("tin can");
		expect(detections[0]?.score).toBeCloseTo(0.9, 5);
		// Deshace escala 0.5 y relleno vertical de 140px.
		const [x, y, width, height] = detections[0]?.bbox ?? [0, 0, 0, 0];
		expect(x).toBeCloseTo(540, 4);
		expect(y).toBeCloseTo(310, 4);
		expect(width).toBeCloseTo(200, 4);
		expect(height).toBeCloseTo(100, 4);
	});

	it("drops detections below the score threshold", () => {
		const { data, dims } = buildOutput([
			{
				centerX: 320,
				centerY: 320,
				width: 100,
				height: 50,
				classIndex: 0,
				score: 0.1,
			},
		]);

		const detections = decodeYoloOutput(data, dims, frame, INPUT_SIZE, {
			classNames: BEVERAGE_MODEL_CLASSES,
			scoreThreshold: 0.25,
		});

		expect(detections).toHaveLength(0);
	});

	it("picks the highest scoring class per anchor", () => {
		const anchors = 1;
		const classCount = BEVERAGE_MODEL_CLASSES.length;
		const data = new Float32Array((4 + classCount) * anchors);
		data[0] = 320;
		data[1] = 320;
		data[2] = 100;
		data[3] = 50;
		data[(4 + 5) * anchors] = 0.4; // glass-normal
		data[(4 + 6) * anchors] = 0.8; // glass-wine

		const detections = decodeYoloOutput(
			data,
			[1, 4 + classCount, anchors],
			frame,
			INPUT_SIZE,
			{ classNames: BEVERAGE_MODEL_CLASSES },
		);

		expect(detections).toHaveLength(1);
		expect(detections[0]?.class).toBe("glass-wine");
	});

	it("clips a box that runs past the frame edge", () => {
		const { data, dims } = buildOutput([
			{
				centerX: 10,
				centerY: 320,
				width: 100,
				height: 50,
				classIndex: 0,
				score: 0.9,
			},
		]);

		const detections = decodeYoloOutput(data, dims, frame, INPUT_SIZE, {
			classNames: BEVERAGE_MODEL_CLASSES,
		});

		expect(detections).toHaveLength(1);
		expect(detections[0]?.bbox[0]).toBe(0);
	});

	it("returns nothing for a malformed tensor", () => {
		expect(
			decodeYoloOutput(new Float32Array(0), [1, 0, 0], frame, INPUT_SIZE, {
				classNames: BEVERAGE_MODEL_CLASSES,
			}),
		).toHaveLength(0);
	});
});

describe("non-maximum suppression", () => {
	it("collapses duplicate boxes of the same class", () => {
		const kept = nonMaxSuppression(
			[
				{ class: "glass-normal", score: 0.9, bbox: [100, 100, 80, 120] },
				{ class: "glass-normal", score: 0.7, bbox: [104, 103, 78, 118] },
			],
			0.45,
		);
		expect(kept).toHaveLength(1);
		expect(kept[0]?.score).toBeCloseTo(0.9, 5);
	});

	it("keeps overlapping boxes of different classes", () => {
		const kept = nonMaxSuppression(
			[
				{ class: "glass-normal", score: 0.9, bbox: [100, 100, 80, 120] },
				{ class: "tin can", score: 0.7, bbox: [104, 103, 78, 118] },
			],
			0.45,
		);
		expect(kept).toHaveLength(2);
	});

	it("keeps two separate drinks side by side", () => {
		const kept = nonMaxSuppression(
			[
				{ class: "glass-normal", score: 0.9, bbox: [100, 100, 80, 120] },
				{ class: "glass-normal", score: 0.8, bbox: [400, 100, 80, 120] },
			],
			0.45,
		);
		expect(kept).toHaveLength(2);
	});
});

function buildOutput(
	boxes: Array<{
		centerX: number;
		centerY: number;
		width: number;
		height: number;
		classIndex: number;
		score: number;
	}>,
) {
	const classCount = BEVERAGE_MODEL_CLASSES.length;
	const channels = 4 + classCount;
	const anchors = boxes.length;
	const data = new Float32Array(channels * anchors);

	boxes.forEach((box, anchor) => {
		data[anchor] = box.centerX;
		data[anchors + anchor] = box.centerY;
		data[2 * anchors + anchor] = box.width;
		data[3 * anchors + anchor] = box.height;
		data[(4 + box.classIndex) * anchors + anchor] = box.score;
	});

	return { data, dims: [1, channels, anchors] };
}

describe("image preprocessing", () => {
	it("converts interleaved RGBA into normalised NCHW planes", () => {
		const size = 2;
		const rgba = new Uint8ClampedArray(size * size * 4);
		// Primer pixel rojo puro, segundo verde puro.
		rgba[0] = 255;
		rgba[5] = 255;

		const tensor = imageDataToNchw(rgba, size);
		const pixels = size * size;

		expect(tensor).toHaveLength(pixels * 3);
		expect(tensor[0]).toBeCloseTo(1, 6);
		expect(tensor[pixels + 1]).toBeCloseTo(1, 6);
		expect(tensor[1]).toBeCloseTo(0, 6);
	});
});
