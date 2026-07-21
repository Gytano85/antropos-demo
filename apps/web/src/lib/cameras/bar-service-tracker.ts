export type BarItemType = "plate" | "glass" | "bottle" | "can";

export type BarItemGroup = "drink" | "food";

/**
 * Los recipientes de bebida se cuentan como un solo grupo. El detector alterna
 * con frecuencia entre vaso/botella/lata sobre el mismo objeto, y separarlos
 * rompia el track y lo contaba dos veces.
 */
export function itemGroup(type: BarItemType): BarItemGroup {
	return type === "plate" ? "food" : "drink";
}

export type CountingDirection =
	| "left_to_right"
	| "right_to_left"
	| "top_to_bottom"
	| "bottom_to_top";

export type Point = {
	x: number;
	y: number;
};

export type CountingLine = {
	start: Point;
	end: Point;
};

export type BoundingBox = [number, number, number, number];

export type BarCandidate = {
	type: BarItemType;
	confidence: number;
	bbox: BoundingBox;
	label: string;
	support: number;
	appearance?: number[];
};

export type TrackState = "tentative" | "confirmed";

export type BarTrack = {
	id: string;
	type: BarItemType;
	label: string;
	state: TrackState;
	confidence: number;
	support: number;
	bbox: BoundingBox;
	center: Point;
	firstCenter: Point;
	previousCenter: Point | null;
	lastStableCenter: Point | null;
	originSide: -1 | 0 | 1;
	lastSide: -1 | 0 | 1;
	velocity: Point;
	appearance?: number[];
	firstSeenAt: number;
	lastSeenAt: number;
	hits: number;
	consecutiveHits: number;
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
	crossingPoint: Point;
};

export type TrackingOptions = {
	now: number;
	line: CountingLine;
	direction: CountingDirection;
	frameWidth: number;
	frameHeight: number;
	minHits?: number;
	minConfirmMs?: number;
	maxMisses?: number;
	maxLostMs?: number;
	lineTolerance?: number;
	minTravelDistance?: number;
	gatePadding?: number;
	idPrefix?: string;
};

const DEFAULTS = {
	minHits: 3,
	minConfirmMs: 450,
	maxMisses: 4,
	maxLostMs: 2_400,
};

let sequence = 0;

export function updateBarTracks(
	tracks: BarTrack[],
	candidates: BarCandidate[],
	options: TrackingOptions,
): { tracks: BarTrack[]; events: BarExitEvent[] } {
	const settings = { ...DEFAULTS, ...options };
	const lineTolerance =
		options.lineTolerance ?? Math.max(7, options.frameWidth * 0.009);
	const matches = optimalAssignments(tracks, candidates, settings);
	const candidatesUsed = new Set(matches.map((match) => match.candidateIndex));
	const matchesByTrack = new Map(
		matches.map((match) => [match.trackIndex, match.candidateIndex]),
	);
	const nextTracks: BarTrack[] = [];
	const events: BarExitEvent[] = [];

	for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
		const track = tracks[trackIndex];
		if (!track) continue;
		const candidateIndex = matchesByTrack.get(trackIndex);
		if (candidateIndex === undefined) {
			const missed = { ...track, misses: track.misses + 1, consecutiveHits: 0 };
			if (
				missed.misses <= settings.maxMisses &&
				settings.now - missed.lastSeenAt <= settings.maxLostMs
			) {
				nextTracks.push(missed);
			}
			continue;
		}

		const candidate = candidates[candidateIndex];
		if (!candidate) continue;
		const center = bboxCenter(candidate.bbox);
		const elapsed = Math.max(1, settings.now - track.lastSeenAt);
		const movement = {
			x: center.x - track.center.x,
			y: center.y - track.center.y,
		};
		const currentSide = stableSide(center, settings.line, lineTolerance);
		const previousStableCenter = track.lastStableCenter ?? track.center;
		const directTravel = pointDistance(track.firstCenter, center);
		const updated: BarTrack = {
			...track,
			label: candidate.label,
			confidence: smooth(track.confidence, candidate.confidence, 0.38),
			support: Math.max(track.support, candidate.support),
			bbox: smoothBox(track.bbox, candidate.bbox),
			previousCenter: track.center,
			center,
			velocity: {
				x: smooth(track.velocity.x, movement.x / elapsed, 0.52),
				y: smooth(track.velocity.y, movement.y / elapsed, 0.52),
			},
			appearance: blendAppearance(track.appearance, candidate.appearance),
			lastSeenAt: settings.now,
			hits: track.hits + 1,
			consecutiveHits: track.consecutiveHits + 1,
			misses: 0,
			travelDistance:
				track.travelDistance + pointDistance(track.center, center),
		};

		if (
			updated.state === "tentative" &&
			updated.hits >= settings.minHits &&
			settings.now - updated.firstSeenAt >= settings.minConfirmMs
		) {
			updated.state = "confirmed";
		}

		if (currentSide !== 0) {
			if (updated.originSide === 0) updated.originSide = currentSide;
			updated.lastSide = currentSide;
			updated.lastStableCenter = center;
		}

		const minimumTravel =
			options.minTravelDistance ?? Math.max(24, options.frameWidth * 0.035);
		const directionalTravel = movementInDirection(
			track.firstCenter,
			center,
			settings.direction,
		);
		const crossed =
			!updated.counted &&
			canCountTrack(updated) &&
			updated.originSide !== 0 &&
			currentSide !== 0 &&
			updated.originSide !== currentSide &&
			directTravel >= minimumTravel &&
			directionalTravel >= minimumTravel &&
			movesInDirection(previousStableCenter, center, settings.direction) &&
			crossesFiniteLine(
				previousStableCenter,
				center,
				settings.line,
				options.gatePadding,
			);

		if (crossed) {
			updated.counted = true;
			events.push({
				trackId: updated.id,
				type: updated.type,
				confidence: updated.confidence,
				direction: settings.direction,
				time: settings.now,
				crossingPoint: lineIntersection(
					previousStableCenter,
					center,
					settings.line,
				),
			});
		}

		nextTracks.push(updated);
	}

	for (let index = 0; index < candidates.length; index += 1) {
		if (candidatesUsed.has(index)) continue;
		const candidate = candidates[index];
		if (!candidate) continue;
		const rescued = rescueCrossedTrack(
			nextTracks,
			candidate,
			settings,
			lineTolerance,
		);
		if (rescued) {
			nextTracks[rescued.trackIndex] = rescued.track;
			events.push(rescued.event);
			continue;
		}
		if (
			nextTracks.some((track) =>
				isDuplicateTrackCandidate(track, candidate, settings),
			)
		) {
			continue;
		}
		const center = bboxCenter(candidate.bbox);
		const side = stableSide(center, settings.line, lineTolerance);
		nextTracks.push({
			id: `${settings.idPrefix ?? "bar"}-${candidate.type}-${++sequence}`,
			type: candidate.type,
			label: candidate.label,
			state: "tentative",
			confidence: candidate.confidence,
			support: candidate.support,
			bbox: candidate.bbox,
			center,
			firstCenter: center,
			previousCenter: null,
			lastStableCenter: side === 0 ? null : center,
			originSide: side,
			lastSide: side,
			velocity: { x: 0, y: 0 },
			appearance: candidate.appearance,
			firstSeenAt: settings.now,
			lastSeenAt: settings.now,
			hits: 1,
			consecutiveHits: 1,
			misses: 0,
			travelDistance: 0,
			counted: false,
		});
	}

	return { tracks: mergeDuplicateTracks(nextTracks), events };
}

/**
 * Colapsa tracks que siguen al mismo objeto fisico.
 *
 * Cuando una deteccion llega tarde el objeto ya se movio y el emparejamiento
 * falla, generando un track nuevo encima del anterior; ambos quedaban vivos y
 * dibujados. El umbral es alto a proposito: dos bebidas juntas en una charola
 * se solapan poco y no deben fusionarse.
 */
export function mergeDuplicateTracks(tracks: BarTrack[]): BarTrack[] {
	if (tracks.length < 2) return tracks;
	const merged: BarTrack[] = [];

	// El mas antiguo gana: conserva su id, su historial y su estado de conteo.
	for (const track of [...tracks].sort(
		(a, b) => a.firstSeenAt - b.firstSeenAt,
	)) {
		const targetIndex = merged.findIndex(
			(existing) =>
				itemGroup(existing.type) === itemGroup(track.type) &&
				followSameObject(existing, track),
		);
		if (targetIndex === -1) {
			merged.push(track);
			continue;
		}
		const target = merged[targetIndex];
		if (target) merged[targetIndex] = absorbTrack(target, track);
	}

	return merged;
}

function followSameObject(a: BarTrack, b: BarTrack) {
	if (intersectionOverUnion(a.bbox, b.bbox) >= 0.65) return true;
	// Una caja casi contenida en otra del mismo tamano tambien es el mismo objeto.
	return (
		intersectionOverSmaller(a.bbox, b.bbox) >= 0.85 &&
		relativeSizeDifference(a.bbox, b.bbox) <= 0.25
	);
}

function absorbTrack(target: BarTrack, duplicate: BarTrack): BarTrack {
	return {
		...target,
		// Si cualquiera ya cruzo, el fusionado queda contado: de lo contrario el
		// objeto volveria a cruzar la linea y se contaria dos veces.
		counted: target.counted || duplicate.counted,
		state:
			target.state === "confirmed" || duplicate.state === "confirmed"
				? "confirmed"
				: target.state,
		hits: Math.max(target.hits, duplicate.hits),
		consecutiveHits: Math.max(
			target.consecutiveHits,
			duplicate.consecutiveHits,
		),
		misses: Math.min(target.misses, duplicate.misses),
		support: Math.max(target.support, duplicate.support),
		confidence: Math.max(target.confidence, duplicate.confidence),
		travelDistance: Math.max(target.travelDistance, duplicate.travelDistance),
		lastSeenAt: Math.max(target.lastSeenAt, duplicate.lastSeenAt),
		originSide:
			target.originSide !== 0 ? target.originSide : duplicate.originSide,
		lastSide: target.lastSide !== 0 ? target.lastSide : duplicate.lastSide,
		lastStableCenter: target.lastStableCenter ?? duplicate.lastStableCenter,
	};
}

function canCountTrack(track: BarTrack) {
	if (track.state === "confirmed") return true;
	return (
		itemGroup(track.type) === "drink" &&
		track.hits >= 2 &&
		track.confidence >= 0.2
	);
}

function rescueCrossedTrack(
	tracks: BarTrack[],
	candidate: BarCandidate,
	options: Required<typeof DEFAULTS> & TrackingOptions,
	lineTolerance: number,
): { trackIndex: number; track: BarTrack; event: BarExitEvent } | null {
	const candidateCenter = bboxCenter(candidate.bbox);
	const candidateSide = stableSide(
		candidateCenter,
		options.line,
		lineTolerance,
	);
	if (candidateSide === 0) return null;
	const minimumTravel =
		options.minTravelDistance ?? Math.max(24, options.frameWidth * 0.035);
	let best: {
		trackIndex: number;
		track: BarTrack;
		score: number;
	} | null = null;
	for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
		const track = tracks[trackIndex];
		if (!track || track.counted) continue;
		if (itemGroup(track.type) !== itemGroup(candidate.type)) continue;
		if (itemGroup(track.type) !== "drink") continue;
		const trackSide =
			track.lastSide !== 0
				? track.lastSide
				: stableSide(track.center, options.line, lineTolerance);
		if (trackSide === 0 || trackSide === candidateSide) continue;
		const directionalTravel = movementInDirection(
			track.firstCenter,
			candidateCenter,
			options.direction,
		);
		const stepTravel = movementInDirection(
			track.center,
			candidateCenter,
			options.direction,
		);
		if (directionalTravel < minimumTravel || stepTravel <= 0) continue;
		if (
			!crossesFiniteLine(
				track.center,
				candidateCenter,
				options.line,
				options.gatePadding,
			)
		) {
			continue;
		}
		const elapsed = Math.max(1, options.now - track.lastSeenAt);
		const distance = pointDistance(track.center, candidateCenter);
		const maxDistance = Math.max(
			options.frameWidth * 0.18,
			bboxDiagonal(track.bbox) * 3.2,
		);
		if (distance > maxDistance) continue;
		const score =
			distance / Math.max(1, maxDistance) +
			appearanceDistance(track.appearance, candidate.appearance) * 0.35;
		const center = candidateCenter;
		const rescuedTrack: BarTrack = {
			...track,
			label: candidate.label,
			confidence: smooth(track.confidence, candidate.confidence, 0.45),
			support: Math.max(track.support, candidate.support),
			bbox: candidate.bbox,
			previousCenter: track.center,
			center,
			velocity: {
				x: smooth(
					track.velocity.x,
					(center.x - track.center.x) / elapsed,
					0.54,
				),
				y: smooth(
					track.velocity.y,
					(center.y - track.center.y) / elapsed,
					0.54,
				),
			},
			appearance: blendAppearance(track.appearance, candidate.appearance),
			lastSeenAt: options.now,
			hits: track.hits + 1,
			consecutiveHits: track.consecutiveHits + 1,
			misses: 0,
			state: "confirmed",
			counted: true,
			lastSide: candidateSide,
			lastStableCenter: center,
			travelDistance: track.travelDistance + distance,
		};
		if (!best || score < best.score) {
			best = { trackIndex, track: rescuedTrack, score };
		}
	}
	if (!best) return null;
	return {
		trackIndex: best.trackIndex,
		track: best.track,
		event: {
			trackId: best.track.id,
			type: best.track.type,
			confidence: best.track.confidence,
			direction: options.direction,
			time: options.now,
			crossingPoint: lineIntersection(
				best.track.previousCenter ?? best.track.firstCenter,
				best.track.center,
				options.line,
			),
		},
	};
}

export function defaultCountingLine(): CountingLine {
	return {
		start: { x: 0.5, y: 0.1 },
		end: { x: 0.5, y: 0.9 },
	};
}

export function placeCountingGate(
	direction: CountingDirection,
	point: Point,
): CountingLine {
	const horizontalTravel =
		direction === "left_to_right" || direction === "right_to_left";
	return horizontalTravel
		? {
				start: { x: clampGate(point.x), y: 0.1 },
				end: { x: clampGate(point.x), y: 0.9 },
			}
		: {
				start: { x: 0.1, y: clampGate(point.y) },
				end: { x: 0.9, y: clampGate(point.y) },
			};
}

export function normalizeLine(line: CountingLine): CountingLine {
	return {
		start: { x: clamp01(line.start.x), y: clamp01(line.start.y) },
		end: { x: clamp01(line.end.x), y: clamp01(line.end.y) },
	};
}

export function trackingRegion(
	line: CountingLine,
	direction: CountingDirection,
) {
	const normalized = normalizeLine(line);
	const center = {
		x: (normalized.start.x + normalized.end.x) / 2,
		y: (normalized.start.y + normalized.end.y) / 2,
	};
	const horizontalTravel =
		direction === "left_to_right" || direction === "right_to_left";
	return horizontalTravel
		? normalizeRegion({
				x: center.x - 0.34,
				y: 0.04,
				width: 0.68,
				height: 0.92,
			})
		: normalizeRegion({
				x: 0.04,
				y: center.y - 0.34,
				width: 0.92,
				height: 0.68,
			});
}

export function itemLabel(type: BarItemType) {
	return {
		plate: "Plato",
		glass: "Vaso/copa",
		bottle: "Botella",
		can: "Lata",
	}[type];
}

function optimalAssignments(
	tracks: BarTrack[],
	candidates: BarCandidate[],
	options: Required<typeof DEFAULTS> & TrackingOptions,
) {
	if (tracks.length === 0 || candidates.length === 0) return [];
	const usableCandidates = candidates.slice(0, 14);
	const costs = tracks.map((track) =>
		usableCandidates.map((candidate) => matchCost(track, candidate, options)),
	);
	const memo = new Map<string, AssignmentSolution>();

	const solve = (trackIndex: number, usedMask: number): AssignmentSolution => {
		if (trackIndex >= tracks.length) return { cost: 0, pairs: [] };
		const key = `${trackIndex}:${usedMask}`;
		const cached = memo.get(key);
		if (cached) return cached;

		const skipped = solve(trackIndex + 1, usedMask);
		let best: AssignmentSolution = {
			cost: skipped.cost + 0.78,
			pairs: skipped.pairs,
		};

		for (
			let candidateIndex = 0;
			candidateIndex < usableCandidates.length;
			candidateIndex += 1
		) {
			if ((usedMask & (1 << candidateIndex)) !== 0) continue;
			const cost = costs[trackIndex]?.[candidateIndex];
			if (cost === undefined || !Number.isFinite(cost) || cost >= 0.78)
				continue;
			const rest = solve(trackIndex + 1, usedMask | (1 << candidateIndex));
			const total = cost + rest.cost;
			if (total < best.cost) {
				best = {
					cost: total,
					pairs: [{ trackIndex, candidateIndex }, ...rest.pairs],
				};
			}
		}

		memo.set(key, best);
		return best;
	};

	return solve(0, 0).pairs;
}

function isDuplicateTrackCandidate(
	track: BarTrack,
	candidate: BarCandidate,
	options: TrackingOptions,
) {
	if (itemGroup(track.type) !== itemGroup(candidate.type)) return false;
	const elapsed = Math.max(1, options.now - track.lastSeenAt);
	const projectedBox = projectBox(track.bbox, track.velocity, elapsed);
	const projectedCenter = bboxCenter(projectedBox);
	const overlap = intersectionOverSmaller(projectedBox, candidate.bbox);
	if (itemGroup(track.type) === "drink") {
		if (overlap >= 0.22) return true;
		if (intersectionOverUnion(projectedBox, candidate.bbox) >= 0.12)
			return true;
		const distance = pointDistance(projectedCenter, bboxCenter(candidate.bbox));
		const size = Math.max(
			projectedBox[2],
			projectedBox[3],
			candidate.bbox[2],
			candidate.bbox[3],
			1,
		);
		return distance / size <= 0.72;
	}
	return overlap >= 0.72;
}

type AssignmentSolution = {
	cost: number;
	pairs: Array<{ trackIndex: number; candidateIndex: number }>;
};

function matchCost(
	track: BarTrack,
	candidate: BarCandidate,
	options: TrackingOptions,
) {
	if (itemGroup(track.type) !== itemGroup(candidate.type)) {
		return Number.POSITIVE_INFINITY;
	}
	const typeSwitchCost = track.type === candidate.type ? 0 : 0.14;
	const elapsed = Math.max(1, options.now - track.lastSeenAt);
	const predicted = bboxCenter(projectBox(track.bbox, track.velocity, elapsed));
	const candidateCenter = bboxCenter(candidate.bbox);
	const frameDiagonal = Math.hypot(options.frameWidth, options.frameHeight);
	const objectDiagonal = Math.max(
		bboxDiagonal(track.bbox),
		bboxDiagonal(candidate.bbox),
	);
	const maxDistance = Math.min(
		frameDiagonal * (itemGroup(track.type) === "drink" ? 0.36 : 0.28),
		Math.max(
			frameDiagonal * 0.055,
			objectDiagonal * (itemGroup(track.type) === "drink" ? 2.35 : 1.7),
		) *
			(1 + Math.min(track.misses, 4) * 0.28),
	);
	const distance = pointDistance(predicted, candidateCenter);
	if (distance > maxDistance) return Number.POSITIVE_INFINITY;

	const overlap = intersectionOverUnion(track.bbox, candidate.bbox);
	const appearanceCost = appearanceDistance(
		track.appearance,
		candidate.appearance,
	);
	if (
		overlap < 0.01 &&
		distance >
			maxDistance * (itemGroup(track.type) === "drink" ? 0.86 : 0.66) &&
		appearanceCost > 0.42
	) {
		return Number.POSITIVE_INFINITY;
	}
	return (
		(distance / Math.max(1, maxDistance)) * 0.42 +
		(1 - overlap) * 0.24 +
		relativeSizeDifference(track.bbox, candidate.bbox) * 0.16 +
		appearanceCost * 0.18 +
		typeSwitchCost
	);
}

function projectBox(
	bbox: BoundingBox,
	velocity: Point,
	elapsedMs: number,
): BoundingBox {
	const elapsed = Math.min(elapsedMs, 1_200);
	return [
		bbox[0] + velocity.x * elapsed,
		bbox[1] + velocity.y * elapsed,
		bbox[2],
		bbox[3],
	];
}

function stableSide(
	point: Point,
	line: CountingLine,
	tolerance: number,
): -1 | 0 | 1 {
	const distance = signedDistanceToLine(point, line);
	if (Math.abs(distance) <= tolerance) return 0;
	return distance > 0 ? 1 : -1;
}

function signedDistanceToLine(point: Point, line: CountingLine) {
	const dx = line.end.x - line.start.x;
	const dy = line.end.y - line.start.y;
	const length = Math.hypot(dx, dy);
	if (length < 1e-6) return 0;
	return (
		(dx * (point.y - line.start.y) - dy * (point.x - line.start.x)) / length
	);
}

function movesInDirection(
	previous: Point,
	current: Point,
	direction: CountingDirection,
) {
	const progress = movementInDirection(previous, current, direction);
	return progress > 1;
}

function movementInDirection(
	start: Point,
	end: Point,
	direction: CountingDirection,
) {
	if (direction === "left_to_right") return end.x - start.x;
	if (direction === "right_to_left") return start.x - end.x;
	if (direction === "top_to_bottom") return end.y - start.y;
	return start.y - end.y;
}

function crossesFiniteLine(
	previous: Point,
	current: Point,
	line: CountingLine,
	padding?: number,
) {
	const intersection = segmentIntersection(previous, current, line);
	if (!intersection) return false;
	const lineLength = pointDistance(line.start, line.end);
	const normalizedPadding =
		(padding ?? lineLength * 0.07) / Math.max(1e-6, lineLength);
	return (
		intersection.pathT >= 0 &&
		intersection.pathT <= 1 &&
		intersection.lineT >= -normalizedPadding &&
		intersection.lineT <= 1 + normalizedPadding
	);
}

function lineIntersection(previous: Point, current: Point, line: CountingLine) {
	const intersection = segmentIntersection(previous, current, line);
	const pathT = intersection?.pathT ?? 0.5;
	return {
		x: previous.x + (current.x - previous.x) * pathT,
		y: previous.y + (current.y - previous.y) * pathT,
	};
}

function segmentIntersection(
	pathStart: Point,
	pathEnd: Point,
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

function smoothBox(previous: BoundingBox, next: BoundingBox): BoundingBox {
	return [
		smooth(previous[0], next[0], 0.72),
		smooth(previous[1], next[1], 0.72),
		smooth(previous[2], next[2], 0.72),
		smooth(previous[3], next[3], 0.72),
	];
}

function blendAppearance(previous?: number[], next?: number[]) {
	if (!next) return previous;
	if (!previous || previous.length !== next.length) return next;
	return previous.map((value, index) =>
		smooth(value, next[index] ?? value, 0.3),
	);
}

function appearanceDistance(a?: number[], b?: number[]) {
	if (!a || !b || a.length !== b.length || a.length === 0) return 0.35;
	let total = 0;
	for (let index = 0; index < a.length; index += 1) {
		total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
	}
	return Math.min(1, total / a.length);
}

function bboxCenter([x, y, width, height]: BoundingBox) {
	return { x: x + width / 2, y: y + height / 2 };
}

function bboxDiagonal([, , width, height]: BoundingBox) {
	return Math.hypot(width, height);
}

function pointDistance(a: Point, b: Point) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function relativeSizeDifference(a: BoundingBox, b: BoundingBox) {
	const areaA = Math.max(1, a[2] * a[3]);
	const areaB = Math.max(1, b[2] * b[3]);
	return Math.min(1, Math.abs(Math.log(areaA / areaB)) / 1.8);
}

function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const areaA = a[2] * a[3];
	const areaB = b[2] * b[3];
	return intersection / Math.max(1, areaA + areaB - intersection);
}

function intersectionOverSmaller(a: BoundingBox, b: BoundingBox) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	return intersection / Math.max(1, Math.min(a[2] * a[3], b[2] * b[3]));
}

function normalizeRegion(region: {
	x: number;
	y: number;
	width: number;
	height: number;
}) {
	const x = clamp01(region.x);
	const y = clamp01(region.y);
	return {
		x,
		y,
		width: Math.max(0.1, Math.min(1 - x, region.width)),
		height: Math.max(0.1, Math.min(1 - y, region.height)),
	};
}

function smooth(previous: number, next: number, nextWeight: number) {
	return previous * (1 - nextWeight) + next * nextWeight;
}

function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

function clampGate(value: number) {
	if (!Number.isFinite(value)) return 0.5;
	return Math.max(0.1, Math.min(0.9, value));
}
