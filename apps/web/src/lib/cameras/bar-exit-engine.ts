export type BarItemType = "plate" | "glass" | "bottle" | "can";

export type CountingDirection =
	| "left_to_right"
	| "right_to_left"
	| "top_to_bottom"
	| "bottom_to_top";

export type LinePoint = {
	x: number;
	y: number;
};

export type CountingLine = {
	start: LinePoint;
	end: LinePoint;
};

export type ObjectCandidate = {
	type: BarItemType;
	confidence: number;
	bbox: [number, number, number, number];
	label?: string;
};

export type ObjectTrack = {
	id: string;
	type: BarItemType;
	confidence: number;
	center: LinePoint;
	previousCenter: LinePoint | null;
	bbox: [number, number, number, number];
	firstSeenAt: number;
	lastSeenAt: number;
	hits: number;
	misses: number;
	counted: boolean;
};

export type BarExitEvent = {
	trackId: string;
	type: BarItemType;
	confidence: number;
	direction: CountingDirection;
	time: number;
};

export type TrackingOptions = {
	now: number;
	line: CountingLine;
	direction: CountingDirection;
	minHits: number;
	maxMisses: number;
	matchDistance: number;
};

let trackSequence = 0;

export function classifyBarCandidate(prediction: {
	class: string;
	score: number;
	bbox: [number, number, number, number];
}): ObjectCandidate | null {
	const label = prediction.class.toLowerCase();
	const type = itemTypeFromLabel(label);
	if (!type) return null;
	if (prediction.score < minConfidenceForType(type)) return null;
	return {
		type,
		confidence: prediction.score,
		bbox: prediction.bbox,
		label: prediction.class,
	};
}

export function updateObjectTracks(
	tracks: ObjectTrack[],
	candidates: ObjectCandidate[],
	options: TrackingOptions,
): { tracks: ObjectTrack[]; events: BarExitEvent[] } {
	const unmatchedCandidates = [...candidates];
	const nextTracks: ObjectTrack[] = [];
	const events: BarExitEvent[] = [];

	for (const track of tracks) {
		const matchIndex = findBestMatch(track, unmatchedCandidates, options);
		if (matchIndex === -1) {
			const missed = { ...track, misses: track.misses + 1 };
			if (missed.misses <= options.maxMisses) nextTracks.push(missed);
			continue;
		}

		const [candidate] = unmatchedCandidates.splice(matchIndex, 1);
		const center = bboxCenter(candidate.bbox);
		const updated: ObjectTrack = {
			...track,
			type: candidate.type,
			confidence: smoothConfidence(track.confidence, candidate.confidence),
			previousCenter: track.center,
			center,
			bbox: candidate.bbox,
			lastSeenAt: options.now,
			hits: track.hits + 1,
			misses: 0,
		};

		if (
			!updated.counted &&
			updated.hits >= options.minHits &&
			crossedLine(updated.previousCenter, updated.center, options)
		) {
			updated.counted = true;
			events.push({
				trackId: updated.id,
				type: updated.type,
				confidence: updated.confidence,
				direction: options.direction,
				time: options.now,
			});
		}

		nextTracks.push(updated);
	}

	for (const candidate of unmatchedCandidates) {
		const center = bboxCenter(candidate.bbox);
		nextTracks.push({
			id: `${candidate.type}_${++trackSequence}`,
			type: candidate.type,
			confidence: candidate.confidence,
			center,
			previousCenter: null,
			bbox: candidate.bbox,
			firstSeenAt: options.now,
			lastSeenAt: options.now,
			hits: 1,
			misses: 0,
			counted: false,
		});
	}

	return { tracks: nextTracks, events };
}

export function defaultCountingLine(): CountingLine {
	return {
		start: { x: 0.5, y: 0.12 },
		end: { x: 0.5, y: 0.88 },
	};
}

export function normalizeLine(line: CountingLine): CountingLine {
	return {
		start: {
			x: clamp01(line.start.x),
			y: clamp01(line.start.y),
		},
		end: {
			x: clamp01(line.end.x),
			y: clamp01(line.end.y),
		},
	};
}

export function itemLabel(type: BarItemType) {
	const labels: Record<BarItemType, string> = {
		plate: "Plato",
		glass: "Vaso/copa",
		bottle: "Botella",
		can: "Lata",
	};
	return labels[type];
}

function itemTypeFromLabel(label: string): BarItemType | null {
	if (label === "cup" || label === "wine glass") return "glass";
	if (label === "bottle") return "bottle";
	if (label === "can") return "can";
	if (label === "bowl" || label === "dining table" || label === "plate") {
		return "plate";
	}
	return null;
}

function minConfidenceForType(type: BarItemType) {
	if (type === "plate") return 0.32;
	if (type === "glass") return 0.35;
	return 0.4;
}

function findBestMatch(
	track: ObjectTrack,
	candidates: ObjectCandidate[],
	options: TrackingOptions,
) {
	let bestIndex = -1;
	let bestDistance = Number.POSITIVE_INFINITY;

	candidates.forEach((candidate, index) => {
		if (candidate.type !== track.type) return;
		const distance = pointDistance(track.center, bboxCenter(candidate.bbox));
		if (distance < bestDistance && distance <= options.matchDistance) {
			bestDistance = distance;
			bestIndex = index;
		}
	});

	return bestIndex;
}

function crossedLine(
	previous: LinePoint | null,
	current: LinePoint,
	options: TrackingOptions,
) {
	if (!previous) return false;
	const line = normalizeLine(options.line);
	const previousSide = sideOfLine(previous, line);
	const currentSide = sideOfLine(current, line);
	if (previousSide === 0 || currentSide === 0) return false;
	if (Math.sign(previousSide) === Math.sign(currentSide)) return false;

	if (options.direction === "left_to_right") {
		return current.x > previous.x && current.x >= line.start.x;
	}
	if (options.direction === "right_to_left") {
		return current.x < previous.x && current.x <= line.start.x;
	}
	if (options.direction === "top_to_bottom") {
		return current.y > previous.y && current.y >= line.start.y;
	}
	return current.y < previous.y && current.y <= line.start.y;
}

function sideOfLine(point: LinePoint, line: CountingLine) {
	return (
		(line.end.x - line.start.x) * (point.y - line.start.y) -
		(line.end.y - line.start.y) * (point.x - line.start.x)
	);
}

function bboxCenter([x, y, width, height]: [number, number, number, number]) {
	return {
		x: x + width / 2,
		y: y + height / 2,
	};
}

function pointDistance(a: LinePoint, b: LinePoint) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function smoothConfidence(previous: number, next: number) {
	return Math.round((previous * 0.65 + next * 0.35) * 100) / 100;
}

function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
