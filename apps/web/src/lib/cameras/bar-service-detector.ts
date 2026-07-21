import type {
	BarCandidate,
	BarItemType,
	BoundingBox,
} from "./bar-service-tracker";

export const BAR_MODEL_ID = "Xenova/owlv2-base-patch16-ensemble";

/**
 * Clases del modelo "Beverage Containers" (YOLOv8n, 15.6k imagenes).
 * El orden define el indice de cada clase en la salida ONNX: debe coincidir
 * exactamente con el `names` del data.yaml que acompana a los pesos.
 */
export const BEVERAGE_MODEL_CLASSES = [
	"bottle-glass",
	"bottle-plastic",
	"cup-disposable",
	"cup-handle",
	"glass-mug",
	"glass-normal",
	"glass-wine",
	"gym bottle",
	"tin can",
] as const;

export const BAR_MODEL_LABELS = [
	"a plate with food",
	"a dinner plate",
	"a bowl with food",
	"a serving tray with food",
	"a drinking glass",
	"a wine glass",
	"a cup with a drink",
	"a beverage bottle",
	"a beer bottle",
	"a water bottle",
	"a beverage can",
	"a beer can",
	"a soda can",
	"a human hand",
	"a person's arm",
	"a person",
	"a stuffed toy",
	"a smartphone",
	"a book",
	"a folded cloth",
	"a kitchen utensil",
] as const;

export type BarModelDetection = {
	score: number;
	label: string;
	box: {
		xmin: number;
		ymin: number;
		xmax: number;
		ymax: number;
	};
};

export type FrameSize = {
	width: number;
	height: number;
};

export type CocoModelDetection = {
	class: string;
	score: number;
	bbox: BoundingBox;
};

type PositiveDetection = {
	type: BarItemType;
	label: string;
	score: number;
	bbox: BoundingBox;
};

type NegativeDetection = {
	label: string;
	score: number;
	bbox: BoundingBox;
};

const POSITIVE_LABELS = new Map<string, BarItemType>([
	["a plate with food", "plate"],
	["a dinner plate", "plate"],
	["a bowl with food", "plate"],
	["a serving tray with food", "plate"],
	["bowl", "plate"],
	["frisbee", "plate"],
	["a drinking glass", "glass"],
	["a wine glass", "glass"],
	["a cup with a drink", "glass"],
	["cup", "glass"],
	["wine glass", "glass"],
	["a beverage bottle", "bottle"],
	["a beer bottle", "bottle"],
	["a water bottle", "bottle"],
	["bottle", "bottle"],
	["a beverage can", "can"],
	["a beer can", "can"],
	["a soda can", "can"],
	// Modelo Beverage Containers.
	["bottle-glass", "bottle"],
	["bottle-plastic", "bottle"],
	["gym bottle", "bottle"],
	["tin can", "can"],
	["glass-mug", "glass"],
	["glass-normal", "glass"],
	["glass-wine", "glass"],
	["cup-disposable", "glass"],
	["cup-handle", "glass"],
]);

const NEGATIVE_LABELS = new Set<string>(
	BAR_MODEL_LABELS.filter((label) => !POSITIVE_LABELS.has(label)),
);

const THRESHOLDS: Record<
	BarItemType,
	{ weak: number; strong: number; minSupport: number }
> = {
	plate: { weak: 0.1, strong: 0.23, minSupport: 2 },
	glass: { weak: 0.1, strong: 0.22, minSupport: 2 },
	bottle: { weak: 0.11, strong: 0.24, minSupport: 2 },
	can: { weak: 0.1, strong: 0.23, minSupport: 2 },
};

export function candidatesFromOwlDetections(
	detections: BarModelDetection[],
	frame: FrameSize,
): BarCandidate[] {
	if (frame.width <= 0 || frame.height <= 0) return [];
	const positives: PositiveDetection[] = [];
	const negatives: NegativeDetection[] = [];

	for (const detection of detections) {
		if (!Number.isFinite(detection.score) || detection.score < 0.07) continue;
		const label = normalizeLabel(detection.label);
		const bbox = boxToBbox(detection.box);
		if (!bbox || !fitsFrame(bbox, frame)) continue;
		const type = POSITIVE_LABELS.get(label);
		if (type) {
			if (fitsTypeGeometry(type, bbox, frame)) {
				positives.push({ type, label, score: detection.score, bbox });
			}
			continue;
		}
		if (NEGATIVE_LABELS.has(label) || looksNegative(label)) {
			negatives.push({ label, score: detection.score, bbox });
		}
	}

	const candidates = clusterPositives(positives)
		.map((cluster) => clusterToCandidate(cluster, negatives))
		.filter((candidate): candidate is BarCandidate => Boolean(candidate))
		.sort((a, b) => b.confidence - a.confidence);

	return suppressNearDuplicates(candidates).slice(0, 14);
}

export function candidatesFromCocoDetections(
	detections: CocoModelDetection[],
	frame: FrameSize,
): BarCandidate[] {
	if (frame.width <= 0 || frame.height <= 0) return [];
	const candidates: BarCandidate[] = [];

	for (const detection of detections) {
		if (!Number.isFinite(detection.score) || detection.score < 0.11) continue;
		const label = normalizeLabel(detection.class);
		const type = POSITIVE_LABELS.get(label);
		if (!type) continue;
		if (!fitsFrame(detection.bbox, frame)) continue;
		if (!fitsTypeGeometry(type, detection.bbox, frame)) continue;
		candidates.push({
			type,
			label,
			confidence: detection.score,
			bbox: detection.bbox,
			support: 1,
		});
	}

	return suppressNearDuplicates(
		candidates.sort((a, b) => b.confidence - a.confidence),
	).slice(0, 14);
}

function clusterPositives(detections: PositiveDetection[]) {
	const clusters: PositiveDetection[][] = [];
	for (const detection of [...detections].sort((a, b) => b.score - a.score)) {
		const matching = clusters.find((cluster) => {
			const first = cluster[0];
			if (!first || first.type !== detection.type) return false;
			return cluster.some(
				(member) =>
					intersectionOverUnion(member.bbox, detection.bbox) >= 0.34 ||
					intersectionOverSmaller(member.bbox, detection.bbox) >= 0.74,
			);
		});
		if (matching) matching.push(detection);
		else clusters.push([detection]);
	}
	return clusters;
}

function clusterToCandidate(
	cluster: PositiveDetection[],
	negatives: NegativeDetection[],
): BarCandidate | null {
	const strongest = cluster[0];
	if (!strongest) return null;
	const support = new Set(cluster.map((item) => item.label)).size;
	const threshold = THRESHOLDS[strongest.type];
	if (
		strongest.score < threshold.strong &&
		(strongest.score < threshold.weak || support < threshold.minSupport)
	) {
		return null;
	}

	const bbox = weightedBox(cluster);
	const strongestNegative = negatives
		.filter(
			(negative) =>
				intersectionOverSmaller(bbox, negative.bbox) >= 0.5 ||
				intersectionOverUnion(bbox, negative.bbox) >= 0.34,
		)
		.sort((a, b) => b.score - a.score)[0];
	if (strongestNegative) {
		const clearlyNegative = strongestNegative.score >= strongest.score * 1.28;
		const weakAndNegative =
			support < 2 && strongestNegative.score >= strongest.score * 0.94;
		if (clearlyNegative || weakAndNegative) return null;
	}

	return {
		type: strongest.type,
		label: strongest.label,
		confidence: Math.min(
			0.99,
			strongest.score + Math.min(0.1, (support - 1) * 0.035),
		),
		bbox,
		support,
	};
}

function suppressNearDuplicates(candidates: BarCandidate[]) {
	const kept: BarCandidate[] = [];
	for (const candidate of candidates) {
		const duplicate = kept.some((current) => {
			const overlap = intersectionOverSmaller(current.bbox, candidate.bbox);
			if (isDrink(current.type) && isDrink(candidate.type)) {
				if (overlap >= 0.34) return true;
				if (intersectionOverUnion(current.bbox, candidate.bbox) >= 0.18)
					return true;
				return centerDistanceRatio(current.bbox, candidate.bbox) <= 0.46;
			}
			if (overlap < 0.9) return false;
			if (current.type === candidate.type) return true;
			return intersectionOverUnion(current.bbox, candidate.bbox) >= 0.78;
		});
		if (!duplicate) kept.push(candidate);
	}
	return kept;
}

function isDrink(type: BarItemType) {
	return type === "glass" || type === "bottle" || type === "can";
}

function centerDistanceRatio(a: BoundingBox, b: BoundingBox) {
	const centerA = { x: a[0] + a[2] / 2, y: a[1] + a[3] / 2 };
	const centerB = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 };
	const distance = Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
	const size = Math.max(1, Math.max(a[2], a[3], b[2], b[3]));
	return distance / size;
}

function weightedBox(cluster: PositiveDetection[]): BoundingBox {
	let total = 0;
	const sums = [0, 0, 0, 0];
	for (const detection of cluster) {
		const weight = Math.max(0.01, detection.score ** 2);
		total += weight;
		for (let index = 0; index < 4; index += 1) {
			sums[index] = (sums[index] ?? 0) + (detection.bbox[index] ?? 0) * weight;
		}
	}
	return sums.map((value) => value / Math.max(0.01, total)) as BoundingBox;
}

function fitsFrame(bbox: BoundingBox, frame: FrameSize) {
	const [x, y, width, height] = bbox;
	if (width < 8 || height < 8) return false;
	if (x + width < 0 || y + height < 0 || x > frame.width || y > frame.height) {
		return false;
	}
	const areaRatio = (width * height) / (frame.width * frame.height);
	if (areaRatio < 0.0009 || areaRatio > 0.48) return false;
	if (width / frame.width > 0.94 && height / frame.height > 0.62) return false;
	return true;
}

function fitsTypeGeometry(
	type: BarItemType,
	bbox: BoundingBox,
	frame: FrameSize,
) {
	const [, , width, height] = bbox;
	const aspect = width / Math.max(1, height);
	const heightRatio = height / frame.height;
	if (type === "plate") return aspect >= 0.28 && aspect <= 5.2;
	if (type === "glass") return aspect >= 0.16 && aspect <= 2.5;
	if (type === "bottle")
		return aspect >= 0.12 && aspect <= 2.1 && heightRatio >= 0.035;
	return aspect >= 0.18 && aspect <= 2.2;
}

function boxToBbox(box: BarModelDetection["box"]): BoundingBox | null {
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

function normalizeLabel(label: string) {
	return label.trim().toLowerCase().replace(/[.]+$/g, "");
}

function looksNegative(label: string) {
	return /\b(hand|arm|person|human|toy|teddy|plush|phone|smartphone|book|cloth|utensil)\b/.test(
		label,
	);
}

function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
	const intersection = intersectionArea(a, b);
	return intersection / Math.max(1, area(a) + area(b) - intersection);
}

function intersectionOverSmaller(a: BoundingBox, b: BoundingBox) {
	const intersection = intersectionArea(a, b);
	return intersection / Math.max(1, Math.min(area(a), area(b)));
}

function intersectionArea(a: BoundingBox, b: BoundingBox) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function area([, , width, height]: BoundingBox) {
	return Math.max(0, width) * Math.max(0, height);
}
