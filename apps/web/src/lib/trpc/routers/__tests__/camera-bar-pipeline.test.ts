import { describe, expect, test } from "bun:test";
import {
	type ObjectTrack,
	updateObjectTracks,
} from "../../../cameras/bar-exit-engine";
import { AdaptiveMotionDetector } from "../../../cameras/bar-motion-engine";

describe("bar camera pipeline", () => {
	test("detects, tracks and counts one served object exactly once", () => {
		const detector = calibratedDetector();
		let tracks: ObjectTrack[] = [];
		const events = [20, 32, 44, 56, 68, 80, 92, 104].flatMap((x, index) => {
			const analysis = detector.analyze(
				frameWithObjects([{ x, y: 38, width: 22, height: 18 }]),
			);
			const tracked = updateObjectTracks(tracks, analysis.candidates, {
				now: index * 120,
				line: { start: { x: 80, y: 8 }, end: { x: 80, y: 92 } },
				direction: "left_to_right",
				minHits: 5,
				maxMisses: 4,
				matchDistance: 34,
				lineTolerance: 3,
				minTravelDistance: 24,
				gatePadding: 4,
				idPrefix: "pipeline",
			});
			tracks = tracked.tracks;
			return tracked.events;
		});

		expect(events).toHaveLength(1);
		expect(events[0]?.crossingPoint.x).toBeCloseTo(80, 4);
		expect(tracks).toHaveLength(1);
		expect(tracks[0]?.counted).toBe(true);
	});

	test("counts two objects crossing together as two independent tracks", () => {
		const detector = calibratedDetector();
		let tracks: ObjectTrack[] = [];
		const events = [20, 32, 44, 56, 68, 80, 92].flatMap((x, index) => {
			const analysis = detector.analyze(
				frameWithObjects([
					{ x, y: 18, width: 20, height: 15 },
					{ x: x - 4, y: 67, width: 22, height: 16 },
				]),
			);
			const tracked = updateObjectTracks(tracks, analysis.candidates, {
				now: index * 120,
				line: { start: { x: 80, y: 5 }, end: { x: 80, y: 96 } },
				direction: "left_to_right",
				minHits: 5,
				maxMisses: 4,
				matchDistance: 36,
				lineTolerance: 3,
				minTravelDistance: 24,
				gatePadding: 4,
				idPrefix: "pipeline-two",
			});
			tracks = tracked.tracks;
			return tracked.events;
		});

		expect(events).toHaveLength(2);
		expect(new Set(events.map((event) => event.trackId)).size).toBe(2);
	});

	test("preserves the track across a brief occlusion before the line", () => {
		const detector = calibratedDetector();
		let tracks: ObjectTrack[] = [];
		const positions: Array<number | null> = [20, 32, null, 44, 56, 68, 80, 92];
		const events = positions.flatMap((x, index) => {
			const analysis = detector.analyze(
				x === null
					? solidFrame(160, 100, 38)
					: frameWithObjects([{ x, y: 40, width: 22, height: 18 }]),
			);
			const tracked = updateObjectTracks(tracks, analysis.candidates, {
				now: index * 120,
				line: { start: { x: 80, y: 8 }, end: { x: 80, y: 92 } },
				direction: "left_to_right",
				minHits: 5,
				maxMisses: 4,
				matchDistance: 42,
				lineTolerance: 3,
				minTravelDistance: 24,
				gatePadding: 4,
				idPrefix: "pipeline-occluded",
			});
			tracks = tracked.tracks;
			return tracked.events;
		});

		expect(events).toHaveLength(1);
		expect(tracks).toHaveLength(1);
	});
});

function calibratedDetector() {
	const detector = new AdaptiveMotionDetector({
		calibrationFrames: 4,
		thresholdFloor: 16,
	});
	detector.beginCalibration();
	for (let index = 0; index < 4; index++) {
		detector.analyze(solidFrame(160, 100, 38));
	}
	return detector;
}

function frameWithObjects(
	objects: Array<{ x: number; y: number; width: number; height: number }>,
) {
	const frame = solidFrame(160, 100, 38);
	for (const object of objects) {
		for (let y = object.y; y < object.y + object.height; y++) {
			for (let x = object.x; x < object.x + object.width; x++) {
				const index = (y * frame.width + x) * 4;
				frame.data[index] = 210;
				frame.data[index + 1] = 126;
				frame.data[index + 2] = 62;
			}
		}
	}
	return frame;
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
