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
		for (let py = y; py < y + rectHeight; py++) {
			for (let px = x; px < x + rectWidth; px++) {
				const index = (py * width + px) * 4;
				frame.data[index] = 220;
				frame.data[index + 1] = 120;
				frame.data[index + 2] = 60;
			}
		}
	}
	return frame;
}
