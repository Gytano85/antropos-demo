import { describe, expect, it } from "bun:test";
import { evaluatePresenceWindow } from "../../../cameras/presence-engine";

describe("camera presence engine", () => {
	it("keeps presence stable across one missed frame", () => {
		const previous = evaluatePresenceWindow(
			[
				{ time: 0, personCount: 1, confidence: 0.9, source: "model" },
				{ time: 1000, personCount: 1, confidence: 0.85, source: "model" },
			],
			{
				now: 1000,
				windowMs: 15_000,
				holdMs: 5_000,
				minPositiveRatio: 0.42,
				minSamples: 2,
			},
		);

		const current = evaluatePresenceWindow(
			[
				{ time: 0, personCount: 1, confidence: 0.9, source: "model" },
				{ time: 1000, personCount: 1, confidence: 0.85, source: "model" },
				{ time: 2000, personCount: 0, confidence: null, source: "none" },
			],
			{
				now: 2000,
				windowMs: 15_000,
				holdMs: 5_000,
				minPositiveRatio: 0.42,
				minSamples: 2,
				previous,
			},
		);

		expect(current.personCount).toBe(1);
		expect(current.status).toBe("present");
	});

	it("does not detect a person from empty model samples", () => {
		const result = evaluatePresenceWindow(
			[
				{ time: 0, personCount: 0, source: "none" },
				{ time: 1000, personCount: 0, source: "none" },
			],
			{
				now: 1000,
				windowMs: 15_000,
				holdMs: 5_000,
				minPositiveRatio: 0.42,
				minSamples: 2,
			},
		);

		expect(result.personCount).toBe(0);
		expect(result.status).toBe("absent");
	});

	it("preserves multiple people when repeated samples see two people", () => {
		const result = evaluatePresenceWindow(
			[
				{ time: 0, personCount: 2, confidence: 0.82, source: "model" },
				{ time: 1000, personCount: 1, confidence: 0.8, source: "model" },
				{ time: 2000, personCount: 2, confidence: 0.86, source: "model" },
			],
			{
				now: 2000,
				windowMs: 15_000,
				holdMs: 5_000,
				minPositiveRatio: 0.42,
				minSamples: 2,
			},
		);

		expect(result.personCount).toBe(2);
		expect(result.status).toBe("present");
	});

	it("clears presence after two consecutive empty samples", () => {
		const result = evaluatePresenceWindow(
			[
				{ time: 0, personCount: 1, confidence: 0.9, source: "model" },
				{ time: 1000, personCount: 1, confidence: 0.86, source: "model" },
				{ time: 2000, personCount: 0, confidence: null, source: "none" },
				{ time: 3000, personCount: 0, confidence: null, source: "none" },
			],
			{
				now: 3000,
				windowMs: 15_000,
				holdMs: 5_000,
				minPositiveRatio: 0.42,
				minSamples: 2,
			},
		);

		expect(result.personCount).toBe(0);
		expect(result.status).toBe("absent");
	});
});
