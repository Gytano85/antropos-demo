import { describe, expect, test } from "bun:test";
import {
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
