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
	source?: "motion" | "model";
};

export type ObjectTrack = {
	id: string;
	type: BarItemType;
	confidence: number;
	center: LinePoint;
	firstCenter: LinePoint;
	previousCenter: LinePoint | null;
	lastStableCenter: LinePoint | null;
	lastSide: -1 | 0 | 1;
	velocity: LinePoint;
	bbox: [number, number, number, number];
	label?: string;
	firstSeenAt: number;
	lastSeenAt: number;
	hits: number;
	misses: number;
	travelDistance: number;
	counted: boolean;
};

export type BarExitEvent = {
	trackId: string;
	type: BarItemType;
	confidence: number;
	direction: CountingDirection;
	time: number;
	crossingPoint: LinePoint;
};

export type TrackingOptions = {
	now: number;
	line: CountingLine;
	direction: CountingDirection;
	minHits: number;
	maxMisses: number;
	matchDistance: number;
	lineTolerance?: number;
	minTravelDistance?: number;
	gatePadding?: number;
	idPrefix?: string;
};

let trackSequence = 0;
const trackSession = `${Date.now().toString(36)}-${Math.random()
	.toString(36)
	.slice(2, 7)}`;

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
		source: "model",
	};
}

export function updateObjectTracks(
	tracks: ObjectTrack[],
	candidates: ObjectCandidate[],
	options: TrackingOptions,
): { tracks: ObjectTrack[]; events: BarExitEvent[] } {
	const events: BarExitEvent[] = [];
	const assignments = assignCandidates(tracks, candidates, options);
	const assignedCandidates = new Set(
		assignments.map((item) => item.candidateIndex),
	);
	const nextTracks: ObjectTrack[] = [];

	tracks.forEach((track, trackIndex) => {
		const assignment = assignments.find(
			(item) => item.trackIndex === trackIndex,
		);
		if (!assignment) {
			const missed = { ...track, misses: track.misses + 1 };
			if (missed.misses <= options.maxMisses) nextTracks.push(missed);
			return;
		}

		const candidate = candidates[assignment.candidateIndex];
		if (!candidate) return;
		const center = bboxCenter(candidate.bbox);
		const movement = {
			x: center.x - track.center.x,
			y: center.y - track.center.y,
		};
		const lineTolerance =
			options.lineTolerance ?? Math.max(0.006, options.matchDistance * 0.045);
		const currentSide = stableSide(center, options.line, lineTolerance);
		const travelDistance =
			track.travelDistance + pointDistance(track.center, center);
		const genericCandidate = isGenericMotion(candidate);
		const genericTrack = track.label === "motion-served-object";
		const nextType =
			genericCandidate && !genericTrack ? track.type : candidate.type;
		const nextLabel =
			genericCandidate && !genericTrack ? track.label : candidate.label;
		const updated: ObjectTrack = {
			...track,
			type: nextType,
			label: nextLabel,
			confidence: smoothConfidence(track.confidence, candidate.confidence),
			previousCenter: track.center,
			center,
			bbox: candidate.bbox,
			velocity: {
				x: track.velocity.x * 0.55 + movement.x * 0.45,
				y: track.velocity.y * 0.55 + movement.y * 0.45,
			},
			lastSeenAt: options.now,
			hits: track.hits + 1,
			misses: 0,
			travelDistance,
		};

		const minimumTravel =
			options.minTravelDistance ??
			Math.max(lineTolerance * 2.2, options.matchDistance * 0.12);
		const directionalProgress = movementInConfiguredDirection(
			track.firstCenter,
			center,
			options.direction,
		);
		const crossed =
			!updated.counted &&
			updated.hits >= options.minHits &&
			travelDistance >= minimumTravel &&
			directionalProgress >= minimumTravel &&
			track.lastSide !== 0 &&
			currentSide !== 0 &&
			track.lastSide !== currentSide &&
			movesInDirection(
				track.lastStableCenter ?? track.center,
				center,
				options,
			) &&
			crossesFiniteLine(
				track.lastStableCenter ?? track.center,
				center,
				options.line,
				options.gatePadding,
			);

		if (crossed) {
			updated.counted = true;
			events.push({
				trackId: updated.id,
				type: updated.type,
				confidence: updated.confidence,
				direction: options.direction,
				time: options.now,
				crossingPoint: lineIntersection(
					track.lastStableCenter ?? track.center,
					center,
					options.line,
				),
			});
		}

		if (currentSide !== 0) {
			updated.lastSide = currentSide;
			updated.lastStableCenter = center;
		}
		nextTracks.push(updated);
	});

	candidates.forEach((candidate, candidateIndex) => {
		if (assignedCandidates.has(candidateIndex)) return;
		const center = bboxCenter(candidate.bbox);
		const lineTolerance =
			options.lineTolerance ?? Math.max(0.006, options.matchDistance * 0.045);
		const side = stableSide(center, options.line, lineTolerance);
		nextTracks.push({
			id: `${options.idPrefix ?? trackSession}-${candidate.type}-${++trackSequence}`,
			type: candidate.type,
			confidence: candidate.confidence,
			center,
			firstCenter: center,
			previousCenter: null,
			lastStableCenter: side === 0 ? null : center,
			lastSide: side,
			velocity: { x: 0, y: 0 },
			bbox: candidate.bbox,
			label: candidate.label,
			firstSeenAt: options.now,
			lastSeenAt: options.now,
			hits: 1,
			misses: 0,
			travelDistance: 0,
			counted: false,
		});
	});

	return { tracks: nextTracks, events };
}

export function defaultCountingLine(): CountingLine {
	return {
		start: { x: 0.5, y: 0.12 },
		end: { x: 0.5, y: 0.88 },
	};
}

export function placeCountingGate(
	direction: CountingDirection,
	point: LinePoint,
): CountingLine {
	const horizontalTravel =
		direction === "left_to_right" || direction === "right_to_left";
	return horizontalTravel
		? {
				start: { x: clampGatePosition(point.x), y: 0.12 },
				end: { x: clampGatePosition(point.x), y: 0.88 },
			}
		: {
				start: { x: 0.12, y: clampGatePosition(point.y) },
				end: { x: 0.88, y: clampGatePosition(point.y) },
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

function assignCandidates(
	tracks: ObjectTrack[],
	candidates: ObjectCandidate[],
	options: TrackingOptions,
) {
	const pairs: Array<{
		trackIndex: number;
		candidateIndex: number;
		cost: number;
	}> = [];

	tracks.forEach((track, trackIndex) => {
		candidates.forEach((candidate, candidateIndex) => {
			if (!typesCompatible(track, candidate)) return;
			const predicted = {
				x: track.center.x + track.velocity.x * Math.min(3, track.misses + 1),
				y: track.center.y + track.velocity.y * Math.min(3, track.misses + 1),
			};
			const distance = pointDistance(predicted, bboxCenter(candidate.bbox));
			const adaptiveDistance =
				options.matchDistance * (1 + Math.min(track.misses, 4) * 0.2);
			if (distance > adaptiveDistance) return;
			const overlap = intersectionOverUnion(track.bbox, candidate.bbox);
			const sizePenalty = relativeSizeDifference(track.bbox, candidate.bbox);
			const typePenalty = track.type === candidate.type ? 0 : 0.08;
			pairs.push({
				trackIndex,
				candidateIndex,
				cost:
					(distance / Math.max(1e-6, adaptiveDistance)) * 0.58 +
					(1 - overlap) * 0.22 +
					sizePenalty * 0.2 +
					typePenalty,
			});
		});
	});

	pairs.sort((a, b) => a.cost - b.cost);
	const usedTracks = new Set<number>();
	const usedCandidates = new Set<number>();
	return pairs.filter((pair) => {
		if (
			usedTracks.has(pair.trackIndex) ||
			usedCandidates.has(pair.candidateIndex)
		) {
			return false;
		}
		usedTracks.add(pair.trackIndex);
		usedCandidates.add(pair.candidateIndex);
		return true;
	});
}

function typesCompatible(track: ObjectTrack, candidate: ObjectCandidate) {
	return (
		track.type === candidate.type ||
		track.label === "motion-served-object" ||
		isGenericMotion(candidate)
	);
}

function isGenericMotion(candidate: ObjectCandidate) {
	return (
		candidate.source === "motion" || candidate.label === "motion-served-object"
	);
}

function itemTypeFromLabel(label: string): BarItemType | null {
	if (label === "cup" || label === "wine glass") return "glass";
	if (label === "bottle") return "bottle";
	if (label === "can") return "can";
	if (label === "bowl" || label === "plate") {
		return "plate";
	}
	return null;
}

function minConfidenceForType(type: BarItemType) {
	if (type === "plate") return 0.3;
	if (type === "glass") return 0.32;
	return 0.36;
}

function stableSide(
	point: LinePoint,
	line: CountingLine,
	tolerance: number,
): -1 | 0 | 1 {
	const distance = signedDistanceToLine(point, line);
	if (Math.abs(distance) <= tolerance) return 0;
	return distance > 0 ? 1 : -1;
}

function signedDistanceToLine(point: LinePoint, line: CountingLine) {
	const dx = line.end.x - line.start.x;
	const dy = line.end.y - line.start.y;
	const length = Math.hypot(dx, dy);
	if (length < 1e-6) return 0;
	return (
		(dx * (point.y - line.start.y) - dy * (point.x - line.start.x)) / length
	);
}

function movesInDirection(
	previous: LinePoint,
	current: LinePoint,
	options: TrackingOptions,
) {
	const dx = current.x - previous.x;
	const dy = current.y - previous.y;
	const epsilon = Math.max(0.001, (options.lineTolerance ?? 0) * 0.35);
	if (options.direction === "left_to_right") return dx > epsilon;
	if (options.direction === "right_to_left") return dx < -epsilon;
	if (options.direction === "top_to_bottom") return dy > epsilon;
	return dy < -epsilon;
}

function movementInConfiguredDirection(
	start: LinePoint,
	end: LinePoint,
	direction: CountingDirection,
) {
	if (direction === "left_to_right") return end.x - start.x;
	if (direction === "right_to_left") return start.x - end.x;
	if (direction === "top_to_bottom") return end.y - start.y;
	return start.y - end.y;
}

function crossesFiniteLine(
	previous: LinePoint,
	current: LinePoint,
	line: CountingLine,
	padding?: number,
) {
	const intersection = segmentIntersectionParameters(previous, current, line);
	if (!intersection) return false;
	const lineLength = pointDistance(line.start, line.end);
	const normalizedPadding =
		(padding ?? lineLength * 0.06) / Math.max(1e-6, lineLength);
	return (
		intersection.pathT >= 0 &&
		intersection.pathT <= 1 &&
		intersection.lineT >= -normalizedPadding &&
		intersection.lineT <= 1 + normalizedPadding
	);
}

function lineIntersection(
	previous: LinePoint,
	current: LinePoint,
	line: CountingLine,
) {
	const intersection = segmentIntersectionParameters(previous, current, line);
	const pathT = intersection?.pathT ?? 0.5;
	return {
		x: previous.x + (current.x - previous.x) * pathT,
		y: previous.y + (current.y - previous.y) * pathT,
	};
}

function segmentIntersectionParameters(
	pathStart: LinePoint,
	pathEnd: LinePoint,
	line: CountingLine,
) {
	const rx = pathEnd.x - pathStart.x;
	const ry = pathEnd.y - pathStart.y;
	const sx = line.end.x - line.start.x;
	const sy = line.end.y - line.start.y;
	const denominator = rx * sy - ry * sx;
	if (Math.abs(denominator) < 1e-8) return null;
	const qpx = line.start.x - pathStart.x;
	const qpy = line.start.y - pathStart.y;
	return {
		pathT: (qpx * sy - qpy * sx) / denominator,
		lineT: (qpx * ry - qpy * rx) / denominator,
	};
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

function relativeSizeDifference(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const areaA = Math.max(1e-6, a[2] * a[3]);
	const areaB = Math.max(1e-6, b[2] * b[3]);
	return Math.min(1, Math.abs(Math.log(areaA / areaB)) / 2);
}

function intersectionOverUnion(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const areaA = a[2] * a[3];
	const areaB = b[2] * b[3];
	return intersection / Math.max(1e-6, areaA + areaB - intersection);
}

function smoothConfidence(previous: number, next: number) {
	return Math.round((previous * 0.62 + next * 0.38) * 100) / 100;
}

function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function clampGatePosition(value: number) {
	if (!Number.isFinite(value)) return 0.5;
	return Math.min(0.9, Math.max(0.1, value));
}
