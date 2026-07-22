import { describe, expect, it } from "bun:test";
import {
	type BarCandidate,
	type BarTrack,
	elapsedMatchScale,
	mergeDuplicateTracks,
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

	it("counts a drink once even when the model flips between glass and bottle", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		const xs = [300, 350, 420, 480, 550, 620, 680];
		// El detector alterna de clase sobre el mismo objeto fisico.
		const types: BarCandidate["type"][] = [
			"glass",
			"glass",
			"bottle",
			"glass",
			"bottle",
			"bottle",
			"glass",
		];
		for (let index = 0; index < xs.length; index += 1) {
			const result = updateBarTracks(
				tracks,
				[drinkCandidate(xs[index] ?? 0, 300, types[index] ?? "glass")],
				{ ...options, now: index * 250 },
			);
			tracks = result.tracks;
			events.push(...result.events);
		}
		expect(events).toHaveLength(1);
		expect(tracks).toHaveLength(1);
	});

	it("counts a fast drink crossing before full confirmation", () => {
		let tracks: BarTrack[] = [];
		const events = [];
		for (const [index, x] of [440, 575].entries()) {
			const result = updateBarTracks(
				tracks,
				[drinkCandidate(x, 300, "glass")],
				{ ...options, now: index * 120 },
			);
			tracks = result.tracks;
			events.push(...result.events);
		}

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("glass");
		expect(tracks[0]?.counted).toBe(true);
	});

	it("keeps a plate and a drink on separate tracks", () => {
		const result = updateBarTracks(
			[],
			[drinkCandidate(300, 300, "glass"), drinkCandidate(300, 300, "plate")],
			{ ...options, now: 0 },
		);
		expect(result.tracks).toHaveLength(2);
	});

	it("does not open multiple tracks for duplicate drink boxes", () => {
		const result = updateBarTracks(
			[],
			[
				drinkCandidate(300, 300, "glass", 0.6),
				drinkCandidate(306, 305, "bottle", 0.52),
				drinkCandidate(294, 296, "can", 0.48),
			],
			{ ...options, now: 0 },
		);

		expect(result.tracks).toHaveLength(1);
	});
});

function drinkCandidate(
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
		appearance: [0.4, 0.3, 0.2],
	};
}

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

describe("duplicate track merging", () => {
	it("collapses two tracks sitting on the same object", () => {
		const merged = mergeDuplicateTracks([
			buildTrack({ id: "old", bbox: [100, 100, 90, 120], firstSeenAt: 0 }),
			buildTrack({ id: "new", bbox: [104, 103, 88, 118], firstSeenAt: 500 }),
		]);
		expect(merged).toHaveLength(1);
		// Gana el mas antiguo para no perder su historial ni su id.
		expect(merged[0]?.id).toBe("old");
	});

	it("keeps two drinks standing side by side apart", () => {
		const merged = mergeDuplicateTracks([
			buildTrack({ id: "a", bbox: [100, 100, 90, 120], firstSeenAt: 0 }),
			buildTrack({ id: "b", bbox: [175, 100, 90, 120], firstSeenAt: 0 }),
		]);
		expect(merged).toHaveLength(2);
	});

	it("never resurrects a counted object as uncounted", () => {
		const merged = mergeDuplicateTracks([
			buildTrack({
				id: "old",
				bbox: [100, 100, 90, 120],
				firstSeenAt: 0,
				counted: false,
			}),
			buildTrack({
				id: "new",
				bbox: [102, 101, 90, 120],
				firstSeenAt: 500,
				counted: true,
			}),
		]);
		expect(merged).toHaveLength(1);
		// Si se perdiera el `counted`, el objeto volveria a cruzar y contaria doble.
		expect(merged[0]?.counted).toBe(true);
	});

	it("does not merge a plate into a drink", () => {
		const merged = mergeDuplicateTracks([
			buildTrack({ id: "drink", bbox: [100, 100, 90, 120], firstSeenAt: 0 }),
			buildTrack({
				id: "plate",
				bbox: [100, 100, 90, 120],
				firstSeenAt: 100,
				type: "plate",
			}),
		]);
		expect(merged).toHaveLength(2);
	});

	it("leaves a single track untouched", () => {
		const only = buildTrack({ id: "solo", bbox: [10, 10, 50, 50] });
		expect(mergeDuplicateTracks([only])).toEqual([only]);
	});
});

function buildTrack(overrides: Partial<BarTrack> & { id: string }): BarTrack {
	const bbox = overrides.bbox ?? [0, 0, 50, 50];
	const center = { x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 };
	return {
		type: "glass",
		label: "glass",
		state: "confirmed",
		confidence: 0.5,
		support: 1,
		center,
		firstCenter: center,
		previousCenter: null,
		lastStableCenter: center,
		originSide: 1,
		lastSide: 1,
		velocity: { x: 0, y: 0 },
		firstSeenAt: 0,
		lastSeenAt: 1_000,
		hits: 3,
		consecutiveHits: 3,
		misses: 0,
		travelDistance: 10,
		counted: false,
		...overrides,
		bbox,
	};
}

describe("association window vs sampling rate", () => {
	it("widens the window proportionally to the real gap between samples", () => {
		expect(elapsedMatchScale(180)).toBeCloseTo(1, 6);
		expect(elapsedMatchScale(360)).toBeCloseTo(2, 6);
		// Nunca se encoge por debajo de la referencia ni crece sin limite.
		expect(elapsedMatchScale(40)).toBe(1);
		expect(elapsedMatchScale(10_000)).toBe(3);
		expect(elapsedMatchScale(-5)).toBe(1);
	});

	it("keeps one track for a fast drink when an inference runs slow", () => {
		// Ambas muestras quedan del mismo lado de la linea (x=500) para aislar
		// el gate: si cruzaran, `rescueCrossedTrack` las enlazaria de todos modos
		// y el test no probaria nada. 540ms y ~400px de avance superan la ventana
		// sin escalar (~306px para este tamano de objeto).
		const first = updateBarTracks([], [drinkCandidate(60, 300, "glass")], {
			...options,
			now: 0,
		});
		const second = updateBarTracks(
			first.tracks,
			[drinkCandidate(460, 300, "glass")],
			{ ...options, now: 540 },
		);

		// Sin escalar el gate nacia un segundo track sobre el mismo objeto.
		expect(second.tracks).toHaveLength(1);
	});

	it("still refuses to link two objects that are genuinely far apart", () => {
		const first = updateBarTracks([], [drinkCandidate(120, 300, "glass")], {
			...options,
			now: 0,
		});
		const second = updateBarTracks(
			first.tracks,
			[drinkCandidate(900, 620, "glass")],
			{ ...options, now: 300 },
		);
		expect(second.tracks.length).toBeGreaterThan(1);
	});
});
