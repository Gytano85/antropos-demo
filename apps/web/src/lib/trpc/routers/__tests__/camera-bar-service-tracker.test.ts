import { describe, expect, it } from "bun:test";
import {
	type BarCandidate,
	type BarTrack,
	updateBarTracks,
} from "../../../cameras/bar-service-tracker";

const options = {
	line: { start: { x: 500, y: 40 }, end: { x: 500, y: 680 } },
	direction: "left_to_right" as const,
	frameWidth: 1000,
	frameHeight: 720,
	minHits: 3,
	minConfirmMs: 400,
	maxMisses: 4,
	maxLostMs: 2_000,
	lineTolerance: 8,
	minTravelDistance: 30,
	idPrefix: "test",
};

describe("bar service tracker", () => {
	it("counts one confirmed object exactly once", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		const xs = [300, 350, 420, 480, 550, 620, 680];
		for (let index = 0; index < xs.length; index += 1) {
			const result = updateBarTracks(
				tracks,
				[candidate(xs[index] ?? 0, 300, "plate")],
				{ ...options, now: index * 250 },
			);
			tracks = result.tracks;
			events.push(...result.events);
		}
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("plate");
		expect(tracks[0]?.counted).toBe(true);
	});

	it("tracks and counts two objects crossing together", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		const xs = [310, 365, 430, 485, 550, 620];
		for (let index = 0; index < xs.length; index += 1) {
			const x = xs[index] ?? 0;
			const result = updateBarTracks(
				tracks,
				[
					candidate(x, 220, "plate", 0.34),
					candidate(x + 12, 470, "glass", 0.32),
				],
				{ ...options, now: index * 250 },
			);
			tracks = result.tracks;
			events.push(...result.events);
		}
		expect(events).toHaveLength(2);
		expect(new Set(events.map((event) => event.trackId)).size).toBe(2);
	});

	it("preserves identity through one missed model reading", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		const frames: Array<BarCandidate[]> = [
			[candidate(320, 300, "plate")],
			[candidate(390, 300, "plate")],
			[candidate(455, 300, "plate")],
			[],
			[candidate(550, 300, "plate")],
			[candidate(620, 300, "plate")],
		];
		for (let index = 0; index < frames.length; index += 1) {
			const result = updateBarTracks(tracks, frames[index] ?? [], {
				...options,
				now: index * 250,
			});
			tracks = result.tracks;
			events.push(...result.events);
		}
		expect(events).toHaveLength(1);
		expect(tracks).toHaveLength(1);
	});

	it("never counts a stationary false detection", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		for (let index = 0; index < 10; index += 1) {
			const result = updateBarTracks(
				tracks,
				[candidate(430, 300, "plate", 0.28)],
				{ ...options, now: index * 250 },
			);
			tracks = result.tracks;
			events.push(...result.events);
		}
		expect(events).toHaveLength(0);
		expect(tracks[0]?.state).toBe("confirmed");
	});

	it("does not create a track without a model candidate", () => {
		const result = updateBarTracks([], [], { ...options, now: 0 });
		expect(result.tracks).toHaveLength(0);
		expect(result.events).toHaveLength(0);
	});
});

function candidate(
	centerX: number,
	centerY: number,
	type: BarCandidate["type"],
	confidence = 0.36,
): BarCandidate {
	return {
		type,
		confidence,
		label: type,
		support: 2,
		bbox: [centerX - 55, centerY - 35, 110, 70],
		appearance: type === "glass" ? [0.1, 0.2, 0.3] : [0.7, 0.2, 0.1],
	};
}
