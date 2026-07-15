import { describe, expect, test } from "bun:test";
import {
	type CountingDirection,
	type CountingLine,
	classifyBarCandidate,
	defaultCountingLine,
	type ObjectCandidate,
	type ObjectTrack,
	updateObjectTracks,
} from "../../../cameras/bar-exit-engine";

describe("bar exit engine", () => {
	test("counts one object only once when it crosses the line", () => {
		let tracks: ObjectTrack[] = [];
		const line = defaultCountingLine();
		const frames: ObjectCandidate[][] = [
			[candidate(0.35, 0.5)],
			[candidate(0.45, 0.5)],
			[candidate(0.55, 0.5)],
			[candidate(0.65, 0.5)],
		];

		const events = frames.flatMap((frame, index) => {
			const result = updateObjectTracks(tracks, frame, {
				now: index * 100,
				line,
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 2,
				matchDistance: 0.25,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("plate");
	});

	test("does not count opposite direction", () => {
		let tracks: ObjectTrack[] = [];
		const line = defaultCountingLine();
		const frames: ObjectCandidate[][] = [
			[candidate(0.65, 0.5)],
			[candidate(0.55, 0.5)],
			[candidate(0.45, 0.5)],
		];

		const events = frames.flatMap((frame, index) => {
			const result = updateObjectTracks(tracks, frame, {
				now: index * 100,
				line,
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 2,
				matchDistance: 0.25,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(0);
	});

	test("keeps same track through one missed frame", () => {
		let tracks: ObjectTrack[] = [];
		const line = defaultCountingLine();
		const frames: ObjectCandidate[][] = [
			[candidate(0.35, 0.5)],
			[],
			[candidate(0.47, 0.5)],
			[candidate(0.58, 0.5)],
		];

		const events = frames.flatMap((frame, index) => {
			const result = updateObjectTracks(tracks, frame, {
				now: index * 100,
				line,
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 2,
				matchDistance: 0.25,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(new Set(tracks.map((track) => track.id)).size).toBe(1);
		expect(events).toHaveLength(1);
	});

	test("maps common detector labels into bar item classes", () => {
		expect(
			classifyBarCandidate({
				class: "cup",
				score: 0.7,
				bbox: [0, 0, 1, 1],
			})?.type,
		).toBe("glass");
		expect(
			classifyBarCandidate({
				class: "bottle",
				score: 0.7,
				bbox: [0, 0, 1, 1],
			})?.type,
		).toBe("bottle");
		expect(
			classifyBarCandidate({
				class: "bowl",
				score: 0.7,
				bbox: [0, 0, 1, 1],
			})?.type,
		).toBe("plate");
		expect(
			classifyBarCandidate({
				class: "dining table",
				score: 0.95,
				bbox: [0, 0, 1, 1],
			}),
		).toBeNull();
	});

	test("uses the real pixel coordinate line instead of clamping it to one", () => {
		let tracks: ObjectTrack[] = [];
		const frames: ObjectCandidate[][] = [
			[pixelCandidate(500, 350)],
			[pixelCandidate(590, 350)],
			[pixelCandidate(680, 350)],
		];
		const events = frames.flatMap((frame, index) => {
			const result = updateObjectTracks(tracks, frame, {
				now: index * 100,
				line: { start: { x: 640, y: 80 }, end: { x: 640, y: 640 } },
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 3,
				matchDistance: 260,
				lineTolerance: 8,
				minTravelDistance: 70,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(1);
		expect(events[0]?.crossingPoint.x).toBeCloseTo(640, 4);
	});

	test("tracks two simultaneous objects without swapping their identities", () => {
		let tracks: ObjectTrack[] = [];
		const frames: ObjectCandidate[][] = [
			[candidate(0.3, 0.35), candidate(0.32, 0.7)],
			[candidate(0.44, 0.35), candidate(0.45, 0.7)],
			[candidate(0.58, 0.35), candidate(0.59, 0.7)],
		];
		const events = frames.flatMap((frame, index) => {
			const result = updateObjectTracks(tracks, frame, {
				now: index * 100,
				line: defaultCountingLine(),
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 3,
				matchDistance: 0.24,
				lineTolerance: 0.015,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(2);
		expect(new Set(events.map((event) => event.trackId)).size).toBe(2);
	});

	test("does not count motion that crosses outside the finite line", () => {
		let tracks: ObjectTrack[] = [];
		const events = [0.35, 0.46, 0.58].flatMap((x, index) => {
			const result = updateObjectTracks(tracks, [candidate(x, 0.98)], {
				now: index * 100,
				line: defaultCountingLine(),
				direction: "left_to_right",
				minHits: 2,
				maxMisses: 2,
				matchDistance: 0.25,
				lineTolerance: 0.01,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(0);
	});

	test("keeps a model label when a generic motion candidate follows it", () => {
		let tracks: ObjectTrack[] = [];
		const bottle: ObjectCandidate = {
			type: "bottle",
			confidence: 0.84,
			bbox: [0.3, 0.45, 0.08, 0.14],
			label: "bottle",
			source: "model",
		};
		tracks = updateObjectTracks(tracks, [bottle], {
			now: 0,
			line: defaultCountingLine(),
			direction: "left_to_right",
			minHits: 2,
			maxMisses: 2,
			matchDistance: 0.25,
		}).tracks;
		const generic: ObjectCandidate = {
			...candidate(0.42, 0.52),
			label: "motion-served-object",
			source: "motion",
		};
		tracks = updateObjectTracks(tracks, [generic], {
			now: 100,
			line: defaultCountingLine(),
			direction: "left_to_right",
			minHits: 2,
			maxMisses: 2,
			matchDistance: 0.25,
		}).tracks;

		expect(tracks).toHaveLength(1);
		expect(tracks[0]?.type).toBe("bottle");
	});

	test("counts correctly in every configured direction", () => {
		const verticalLine = defaultCountingLine();
		const horizontalLine: CountingLine = {
			start: { x: 0.12, y: 0.5 },
			end: { x: 0.88, y: 0.5 },
		};
		const scenarios: Array<{
			direction: CountingDirection;
			line: CountingLine;
			points: Array<[number, number]>;
		}> = [
			{
				direction: "left_to_right",
				line: verticalLine,
				points: [
					[0.32, 0.5],
					[0.44, 0.5],
					[0.57, 0.5],
				],
			},
			{
				direction: "right_to_left",
				line: verticalLine,
				points: [
					[0.68, 0.5],
					[0.56, 0.5],
					[0.43, 0.5],
				],
			},
			{
				direction: "top_to_bottom",
				line: horizontalLine,
				points: [
					[0.5, 0.32],
					[0.5, 0.44],
					[0.5, 0.57],
				],
			},
			{
				direction: "bottom_to_top",
				line: horizontalLine,
				points: [
					[0.5, 0.68],
					[0.5, 0.56],
					[0.5, 0.43],
				],
			},
		];

		for (const scenario of scenarios) {
			let tracks: ObjectTrack[] = [];
			const events = scenario.points.flatMap(([x, y], index) => {
				const result = updateObjectTracks(tracks, [candidate(x, y)], {
					now: index * 100,
					line: scenario.line,
					direction: scenario.direction,
					minHits: 2,
					maxMisses: 2,
					matchDistance: 0.25,
					lineTolerance: 0.01,
					minTravelDistance: 0.08,
				});
				tracks = result.tracks;
				return result.events;
			});
			expect(events, scenario.direction).toHaveLength(1);
		}
	});

	test("rejects jitter around the line as a false crossing", () => {
		let tracks: ObjectTrack[] = [];
		const events = [0.484, 0.506, 0.493, 0.508, 0.49].flatMap((x, index) => {
			const result = updateObjectTracks(tracks, [candidate(x, 0.5)], {
				now: index * 100,
				line: defaultCountingLine(),
				direction: "left_to_right",
				minHits: 3,
				maxMisses: 2,
				matchDistance: 0.25,
				lineTolerance: 0.02,
				minTravelDistance: 0.1,
			});
			tracks = result.tracks;
			return result.events;
		});

		expect(events).toHaveLength(0);
	});
});

function candidate(x: number, y: number): ObjectCandidate {
	return {
		type: "plate",
		confidence: 0.82,
		bbox: [x - 0.04, y - 0.04, 0.08, 0.08],
		label: "plate",
	};
}

function pixelCandidate(x: number, y: number): ObjectCandidate {
	return {
		type: "plate",
		confidence: 0.82,
		bbox: [x - 40, y - 30, 80, 60],
		label: "motion-served-object",
		source: "motion",
	};
}
