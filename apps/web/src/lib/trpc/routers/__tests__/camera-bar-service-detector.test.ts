import { describe, expect, it } from "bun:test";
import {
	type BarModelDetection,
	BEVERAGE_MODEL_CLASSES,
	candidatesFromCocoDetections,
	candidatesFromOwlDetections,
} from "../../../cameras/bar-service-detector";

const frame = { width: 800, height: 600 };

describe("bar service OWLv2 post-processing", () => {
	it("requires temporal-friendly visual support for a weak plate proposal", () => {
		const candidates = candidatesFromOwlDetections(
			[detection(0.12, "a dinner plate", [220, 180, 190, 100])],
			frame,
		);
		expect(candidates).toHaveLength(0);
	});

	it("merges two matching prompts into one plate", () => {
		const candidates = candidatesFromOwlDetections(
			[
				detection(0.16, "a dinner plate", [220, 180, 190, 100]),
				detection(0.14, "a plate with food", [226, 184, 182, 96]),
			],
			frame,
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("plate");
		expect(candidates[0]?.support).toBe(2);
	});

	it("rejects a toy that receives a weaker plate proposal", () => {
		const candidates = candidatesFromOwlDetections(
			[
				detection(0.24, "a dinner plate", [180, 100, 250, 280]),
				detection(0.34, "a stuffed toy", [185, 105, 245, 275]),
			],
			frame,
		);
		expect(candidates).toHaveLength(0);
	});

	it("keeps a well-supported plate carried by a hand", () => {
		const candidates = candidatesFromOwlDetections(
			[
				detection(0.3, "a plate with food", [210, 220, 240, 110]),
				detection(0.25, "a dinner plate", [215, 222, 232, 106]),
				detection(0.26, "a human hand", [160, 180, 330, 210]),
			],
			frame,
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("plate");
	});

	it("keeps two separate plates as two candidates", () => {
		const candidates = candidatesFromOwlDetections(
			[
				detection(0.29, "a dinner plate", [80, 170, 180, 90]),
				detection(0.25, "a plate with food", [84, 172, 174, 86]),
				detection(0.31, "a dinner plate", [500, 220, 190, 95]),
				detection(0.24, "a plate with food", [506, 222, 184, 92]),
			],
			frame,
		);
		expect(candidates).toHaveLength(2);
	});

	it("rejects a hallucinated near-full-frame plate", () => {
		const candidates = candidatesFromOwlDetections(
			[detection(0.85, "a dinner plate", [2, 1, 790, 590])],
			frame,
		);
		expect(candidates).toHaveLength(0);
	});

	it("accepts a single strong COCO cup as a bar candidate", () => {
		const candidates = candidatesFromCocoDetections(
			[{ class: "cup", score: 0.62, bbox: [120, 90, 90, 130] }],
			frame,
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("glass");
	});

	it("merges overlapping drink labels into one candidate", () => {
		const candidates = candidatesFromCocoDetections(
			[
				{ class: "cup", score: 0.62, bbox: [120, 90, 90, 130] },
				{ class: "wine glass", score: 0.55, bbox: [126, 96, 82, 118] },
				{ class: "bottle", score: 0.49, bbox: [118, 86, 96, 138] },
			],
			frame,
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("glass");
	});

	it("maps every Beverage Containers class to a bar item type", () => {
		const expected: Record<string, string> = {
			"bottle-glass": "bottle",
			"bottle-plastic": "bottle",
			"gym bottle": "bottle",
			"tin can": "can",
			"glass-mug": "glass",
			"glass-normal": "glass",
			"glass-wine": "glass",
			"cup-disposable": "glass",
			"cup-handle": "glass",
		};

		for (const modelClass of BEVERAGE_MODEL_CLASSES) {
			const candidates = candidatesFromCocoDetections(
				[{ class: modelClass, score: 0.62, bbox: [120, 90, 90, 130] }],
				frame,
			);
			expect(candidates).toHaveLength(1);
			expect(candidates[0]?.type).toBe(expected[modelClass] as never);
		}
	});

	it("treats a COCO frisbee as a plate candidate", () => {
		const candidates = candidatesFromCocoDetections(
			[{ class: "frisbee", score: 0.55, bbox: [220, 180, 190, 100] }],
			frame,
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("plate");
	});
});

function detection(
	score: number,
	label: string,
	[x, y, width, height]: [number, number, number, number],
): BarModelDetection {
	return {
		score,
		label,
		box: { xmin: x, ymin: y, xmax: x + width, ymax: y + height },
	};
}
