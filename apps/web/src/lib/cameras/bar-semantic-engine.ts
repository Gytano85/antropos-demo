import type { BarItemType, ObjectCandidate } from "./bar-exit-engine";

export const BAR_SEMANTIC_PROMPT =
	"plate of food. dinner plate. bowl of food. serving tray. drinking glass. cup. bottle. beverage can. bare hand. fingers. person. human arm. stuffed toy. teddy bear. plush toy. smartphone. book. cloth. utensil.";

export type GroundedDetection = {
	score: number;
	label: string;
	box: {
		xmin: number;
		ymin: number;
		xmax: number;
		ymax: number;
	};
};

type ClassifiedDetection = GroundedDetection & {
	type: BarItemType;
	bbox: [number, number, number, number];
};

export function semanticCandidatesFromDetections(
	detections: GroundedDetection[],
	frame?: { width: number; height: number },
): ObjectCandidate[] {
	const negatives = detections.filter(
		(detection) => detection.score >= 0.2 && isNegativeLabel(detection.label),
	);
	const positives = detections
		.map(classifyDetection)
		.filter((item): item is ClassifiedDetection => Boolean(item))
		.filter((candidate) => fitsCameraFrame(candidate, frame))
		.filter(
			(candidate) =>
				!negatives.some((negative) =>
					negativeInvalidatesCandidate(candidate, negative),
				),
		)
		.sort((a, b) => b.score - a.score);

	const kept: ClassifiedDetection[] = [];
	for (const candidate of positives) {
		if (
			kept.some(
				(current) =>
					current.type === candidate.type &&
					(intersectionOverUnion(current.bbox, candidate.bbox) >= 0.42 ||
						intersectionOverSmaller(current.bbox, candidate.bbox) >= 0.82),
			)
		) {
			continue;
		}
		kept.push(candidate);
	}

	return kept.map((candidate) => ({
		type: candidate.type,
		confidence: candidate.score,
		label: candidate.label,
		source: "model",
		bbox: candidate.bbox,
	}));
}

export function fuseSemanticWithMotion(
	motionCandidates: ObjectCandidate[],
	semanticCandidates: ObjectCandidate[],
) {
	const availableMotion = motionCandidates
		.map((candidate, index) => ({ candidate, index }))
		.filter(({ candidate }) => candidate.source === "motion");
	const usedMotion = new Set<number>();
	const fused: ObjectCandidate[] = [];

	for (const semantic of [...semanticCandidates].sort(
		(a, b) => b.confidence - a.confidence,
	)) {
		const match = availableMotion
			.filter(({ index }) => !usedMotion.has(index))
			.map(({ candidate, index }) => ({
				candidate,
				index,
				score: motionSemanticOverlap(candidate.bbox, semantic.bbox),
			}))
			.filter((item) => item.score >= 0.2)
			.sort((a, b) => b.score - a.score)[0];
		if (!match) continue;
		usedMotion.add(match.index);
		fused.push({
			...match.candidate,
			type: semantic.type,
			label: semantic.label,
			source: "model",
			confidence: Math.max(match.candidate.confidence, semantic.confidence),
		});
	}

	return fused;
}

function classifyDetection(
	detection: GroundedDetection,
): ClassifiedDetection | null {
	if (isNegativeLabel(detection.label)) return null;
	const type = typeFromLabel(detection.label);
	if (!type || detection.score < minimumScore(type)) return null;
	const bbox = boxToBbox(detection.box);
	if (!bbox || bbox[2] < 6 || bbox[3] < 6) return null;
	return { ...detection, type, bbox };
}

function typeFromLabel(label: string): BarItemType | null {
	const normalized = label.toLowerCase();
	if (/\b(bottle)\b/.test(normalized)) return "bottle";
	if (/\b(beverage can|drink can|soda can|beer can|can)\b/.test(normalized)) {
		return "can";
	}
	if (/\b(glass|cup|mug|goblet)\b/.test(normalized)) return "glass";
	if (/\b(plate|bowl|food|dish|tray)\b/.test(normalized)) return "plate";
	return null;
}

function isNegativeLabel(label: string) {
	return /\b(hand|finger|person|human|arm|toy|teddy|bear|plush|doll|glove|phone|smartphone|book|cloth|utensil)\b/i.test(
		label,
	);
}

function minimumScore(type: BarItemType) {
	if (type === "plate") return 0.44;
	if (type === "glass") return 0.38;
	return 0.4;
}

function fitsCameraFrame(
	candidate: ClassifiedDetection,
	frame?: { width: number; height: number },
) {
	if (!frame || frame.width <= 0 || frame.height <= 0) return true;
	const [x, y, width, height] = candidate.bbox;
	const widthRatio = width / frame.width;
	const heightRatio = height / frame.height;
	const areaRatio = (width * height) / (frame.width * frame.height);
	if (x < -frame.width * 0.03 || y < -frame.height * 0.03) return false;
	if (areaRatio < 0.0015 || areaRatio > 0.68) return false;
	if (widthRatio > 0.96 && heightRatio > 0.68) return false;
	const aspectRatio = width / Math.max(1, height);
	if (candidate.type === "plate")
		return aspectRatio >= 0.28 && aspectRatio <= 4;
	if (candidate.type === "glass")
		return aspectRatio >= 0.16 && aspectRatio <= 2.4;
	return aspectRatio >= 0.12 && aspectRatio <= 2.1;
}

function negativeInvalidatesCandidate(
	candidate: ClassifiedDetection,
	negative: GroundedDetection,
) {
	const negativeBox = boxToBbox(negative.box);
	if (!negativeBox) return false;
	const overlap = intersectionOverSmaller(candidate.bbox, negativeBox);
	return overlap >= 0.42 && negative.score >= candidate.score * 0.72;
}

function motionSemanticOverlap(
	motion: [number, number, number, number],
	semantic: [number, number, number, number],
) {
	const coverage = intersectionOverSmaller(motion, semantic);
	const motionCenter = centerOf(motion);
	const semanticCenter = centerOf(semantic);
	const centerDistance = Math.hypot(
		motionCenter.x - semanticCenter.x,
		motionCenter.y - semanticCenter.y,
	);
	const semanticRadius = Math.max(12, Math.hypot(semantic[2], semantic[3]) / 2);
	const proximity = Math.max(0, 1 - centerDistance / semanticRadius);
	return Math.max(coverage, proximity * 0.7);
}

function boxToBbox(
	box: GroundedDetection["box"],
): [number, number, number, number] | null {
	const width = box.xmax - box.xmin;
	const height = box.ymax - box.ymin;
	if (
		![box.xmin, box.ymin, box.xmax, box.ymax, width, height].every(
			Number.isFinite,
		) ||
		width <= 0 ||
		height <= 0
	) {
		return null;
	}
	return [box.xmin, box.ymin, width, height];
}

function centerOf([x, y, width, height]: [number, number, number, number]) {
	return { x: x + width / 2, y: y + height / 2 };
}

function intersectionOverSmaller(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const intersection = intersectionArea(a, b);
	return intersection / Math.max(1, Math.min(area(a), area(b)));
}

function intersectionOverUnion(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const intersection = intersectionArea(a, b);
	return intersection / Math.max(1, area(a) + area(b) - intersection);
}

function intersectionArea(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function area([, , width, height]: [number, number, number, number]) {
	return Math.max(0, width) * Math.max(0, height);
}
