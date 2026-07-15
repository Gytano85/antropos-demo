import { describe, expect, test } from "bun:test";
import type { ObjectCandidate } from "../../../cameras/bar-exit-engine";
import {
	fuseSemanticWithMotion,
	type GroundedDetection,
	semanticCandidatesFromDetections,
} from "../../../cameras/bar-semantic-engine";

describe("bar semantic engine", () => {
	test("accepts a real plate and removes duplicate food boxes", () => {
		const candidates = semanticCandidatesFromDetections([
			detection(0.516, "plate", [2, 1, 956, 486]),
			detection(0.275, "food", [4, 0, 508, 484]),
			detection(0.272, "food", [6, 0, 920, 482]),
		]);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("plate");
	});

	test("rejects the teddy bear output observed from the real model", () => {
		const candidates = semanticCandidatesFromDetections([
			detection(0.504, "food hand stuffed bear", [74, 37, 282, 410]),
			detection(0.359, "plate", [1, 0, 345, 458]),
			detection(0.189, "hand", [74, 39, 282, 416]),
		]);

		expect(candidates).toHaveLength(0);
	});

	test("rejects a hand even when the model also proposes plate", () => {
		const candidates = semanticCandidatesFromDetections([
			detection(0.455, "plate", [2, 0, 955, 634]),
			detection(0.386, "hand stuffed", [658, 197, 920, 395]),
		]);

		expect(candidates).toHaveLength(0);
	});

	test("rejects a full-frame plate hallucination from an unrelated object", () => {
		const candidates = semanticCandidatesFromDetections(
			[detection(0.61, "plate", [1, 0, 639, 359])],
			{ width: 640, height: 360 },
		);

		expect(candidates).toHaveLength(0);
	});

	test("keeps a strong plate when a weaker hand is carrying it", () => {
		const candidates = semanticCandidatesFromDetections([
			detection(0.67, "plate of food", [180, 140, 480, 370]),
			detection(0.34, "human hand", [390, 190, 470, 300]),
		]);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.type).toBe("plate");
	});

	test("does not turn unverified motion into a plate", () => {
		const fused = fuseSemanticWithMotion([motion([20, 20, 60, 45])], []);

		expect(fused).toHaveLength(0);
	});

	test("uses the moving box only after semantic verification", () => {
		const moving = motion([42, 30, 55, 40]);
		const semantic: ObjectCandidate = {
			type: "plate",
			confidence: 0.72,
			label: "plate of food",
			source: "model",
			bbox: [34, 22, 76, 58],
		};

		const fused = fuseSemanticWithMotion([moving], [semantic]);

		expect(fused).toHaveLength(1);
		expect(fused[0]?.bbox).toEqual(moving.bbox);
		expect(fused[0]?.label).toBe("plate of food");
	});
});

function detection(
	score: number,
	label: string,
	[xmin, ymin, xmax, ymax]: [number, number, number, number],
): GroundedDetection {
	return { score, label, box: { xmin, ymin, xmax, ymax } };
}

function motion(bbox: [number, number, number, number]): ObjectCandidate {
	return {
		type: "plate",
		confidence: 0.8,
		label: "motion-served-object",
		source: "motion",
		bbox,
	};
}
