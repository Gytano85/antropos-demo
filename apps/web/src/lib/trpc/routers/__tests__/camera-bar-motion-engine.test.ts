import { describe, expect, test } from "bun:test";
import { defaultCountingLine } from "../../../cameras/bar-exit-engine";
import {
	AdaptiveMotionDetector,
	regionAroundLine,
} from "../../../cameras/bar-motion-engine";

describe("bar motion engine", () => {
	test("calibrates an empty scene and detects a served object", () => {
		const detector = calibratedDetector();
		const result = detector.analyze(frameWithRect(96, 64, [26, 22, 18, 14]));

		expect(result.state).toBe("ready");
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.source).toBe("motion");
		expect(result.candidates[0]?.bbox[0]).toBeLessThanOrEqual(28);
	});

	test("keeps two separated objects as two candidates", () => {
		const detector = calibratedDetector();
		const result = detector.analyze(
			frameWithRect(96, 64, [14, 18, 15, 14], [62, 34, 16, 14]),
		);

		expect(result.candidates).toHaveLength(2);
	});

	test("ignores normal camera noise after calibration", () => {
		const detector = calibratedDetector();
		const noisy = solidFrame(96, 64, 42);
		for (let index = 0; index < noisy.data.length; index += 4) {
			const delta = ((index / 4) % 5) - 2;
			noisy.data[index] += delta;
			noisy.data[index + 1] += delta;
			noisy.data[index + 2] += delta;
		}
		const result = detector.analyze(noisy);

		expect(result.candidates).toHaveLength(0);
		expect(result.foregroundRatio).toBeLessThan(0.01);
	});

	test("does not hallucinate objects from white-background compression blocks", () => {
		const detector = new AdaptiveMotionDetector({ calibrationFrames: 4 });
		detector.beginCalibration();
		for (let index = 0; index < 4; index++) {
			detector.analyze(solidFrame(160, 90, 245));
		}
		const compressed = solidFrame(160, 90, 245);
		const blocks: Array<[number, number]> = [
			[10, 12],
			[32, 52],
			[55, 18],
			[78, 58],
			[101, 24],
			[124, 55],
			[142, 10],
		];
		for (const [x, y] of blocks) {
			paintRect(compressed, x, y, 10, 9, [215, 230, 250]);
		}

		const result = detector.analyze(compressed);

		expect(result.candidates).toHaveLength(0);
	});

	test("compensates automatic exposure changes in a static scene", () => {
		const detector = new AdaptiveMotionDetector({ calibrationFrames: 4 });
		detector.beginCalibration();
		for (let index = 0; index < 4; index++) {
			detector.analyze(solidFrame(160, 90, 215));
		}

		for (const value of [247, 184, 244, 187, 241]) {
			const result = detector.analyze(solidFrame(160, 90, value));
			expect(result.state).toBe("ready");
			expect(result.candidates).toHaveLength(0);
		}
	});

	test("still detects a real object moving over a white background", () => {
		const detector = new AdaptiveMotionDetector({ calibrationFrames: 4 });
		detector.beginCalibration();
		for (let index = 0; index < 4; index++) {
			detector.analyze(solidFrame(160, 90, 245));
		}
		const frame = solidFrame(160, 90, 245);
		paintRect(frame, 62, 34, 30, 22, [175, 90, 45]);

		const result = detector.analyze(frame);

		expect(result.candidates).toHaveLength(1);
	});

	test("stops detections when the whole scene changes", () => {
		const detector = calibratedDetector();
		let result = detector.analyze(solidFrame(96, 64, 180));
		for (let index = 0; index < 4; index++) {
			result = detector.analyze(solidFrame(96, 64, 180));
		}

		expect(result.state).toBe("unstable");
		expect(result.candidates).toHaveLength(0);
	});

	test("builds a bounded detection region around the counting line", () => {
		const region = regionAroundLine(defaultCountingLine(), "left_to_right");
		expect(region.x).toBeCloseTo(0.2, 4);
		expect(region.width).toBeCloseTo(0.6, 4);
		expect(region.y).toBeGreaterThanOrEqual(0);
		expect(region.y + region.height).toBeLessThanOrEqual(1);
	});
});

function calibratedDetector() {
	const detector = new AdaptiveMotionDetector({
		calibrationFrames: 3,
		thresholdFloor: 16,
	});
	detector.beginCalibration();
	for (let index = 0; index < 3; index++) {
		detector.analyze(solidFrame(96, 64, 42));
	}
	return detector;
}

function solidFrame(width: number, height: number, value: number) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let index = 0; index < data.length; index += 4) {
		data[index] = value;
		data[index + 1] = value;
		data[index + 2] = value;
		data[index + 3] = 255;
	}
	return { width, height, data };
}

function frameWithRect(
	width: number,
	height: number,
	...rectangles: Array<[number, number, number, number]>
) {
	const frame = solidFrame(width, height, 42);
	for (const [x, y, rectWidth, rectHeight] of rectangles) {
		paintRect(frame, x, y, rectWidth, rectHeight, [220, 120, 60]);
	}
	return frame;
}

function paintRect(
	frame: ReturnType<typeof solidFrame>,
	x: number,
	y: number,
	width: number,
	height: number,
	color: [number, number, number],
) {
	for (let py = y; py < Math.min(frame.height, y + height); py++) {
		for (let px = x; px < Math.min(frame.width, x + width); px++) {
			const index = (py * frame.width + px) * 4;
			frame.data[index] = color[0];
			frame.data[index + 1] = color[1];
			frame.data[index + 2] = color[2];
		}
	}
}
