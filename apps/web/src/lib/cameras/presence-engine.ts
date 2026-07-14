export type PresenceSample = {
	time: number;
	personCount: number;
	confidence?: number | null;
	source: "model" | "none";
};

export type PresenceState = {
	personCount: number;
	rawPersonCount: number;
	status: "present" | "probably_present" | "absent";
	score: number;
	positiveSamples: number;
	totalSamples: number;
	lastPositiveAt: number | null;
	updatedAt: number;
};

export type PresenceOptions = {
	now: number;
	windowMs: number;
	holdMs: number;
	minPositiveRatio: number;
	minSamples: number;
	previous?: PresenceState;
};

export function evaluatePresenceWindow(
	samples: PresenceSample[],
	options: PresenceOptions,
): PresenceState {
	const windowSamples = samples.filter(
		(sample) => options.now - sample.time <= options.windowMs,
	);
	const totalSamples = windowSamples.length;
	const weightedPositive = windowSamples.reduce(
		(total, sample) => total + positiveWeight(sample),
		0,
	);
	const positiveSamples = windowSamples.filter(
		(sample) => positiveWeight(sample) >= 0.7,
	).length;
	const score =
		totalSamples > 0 ? Math.min(1, weightedPositive / totalSamples) : 0;
	const latestPositive = [...windowSamples]
		.reverse()
		.find((sample) => positiveWeight(sample) >= 0.7);
	const lastPositiveAt =
		latestPositive?.time ?? options.previous?.lastPositiveAt ?? null;
	const enoughSamples = totalSamples >= options.minSamples;
	const newestSamples = windowSamples.slice(-2);
	const consecutiveAbsent =
		newestSamples.length >= 2 &&
		newestSamples.every((sample) => sample.personCount === 0);
	const present = enoughSamples && score >= options.minPositiveRatio;
	const held =
		!consecutiveAbsent &&
		!present &&
		lastPositiveAt !== null &&
		options.now - lastPositiveAt <= options.holdMs &&
		(options.previous?.personCount ?? 0) > 0;
	const personCount = consecutiveAbsent
		? 0
		: present
			? conservativeCount(windowSamples)
			: held
				? (options.previous?.personCount ?? 1)
				: 0;
	const status: PresenceState["status"] = present
		? consecutiveAbsent
			? "absent"
			: "present"
		: held
			? "probably_present"
			: "absent";

	return {
		personCount,
		rawPersonCount: windowSamples.at(-1)?.personCount ?? 0,
		status,
		score: Math.round(score * 100) / 100,
		positiveSamples,
		totalSamples,
		lastPositiveAt,
		updatedAt: options.now,
	};
}

function positiveWeight(sample: PresenceSample) {
	if (sample.personCount > 0) {
		return Math.max(0.75, sample.confidence ?? 0.8);
	}
	return 0;
}

function conservativeCount(samples: PresenceSample[]) {
	const counts = samples
		.filter((sample) => positiveWeight(sample) >= 0.7)
		.map((sample) => Math.max(1, sample.personCount));
	if (counts.length === 0) return 0;
	const frequency = new Map<number, number>();
	for (const count of counts) {
		frequency.set(count, (frequency.get(count) ?? 0) + 1);
	}
	return (
		[...frequency.entries()].sort(
			([countA, hitsA], [countB, hitsB]) => hitsB - hitsA || countB - countA,
		)[0]?.[0] ?? 1
	);
}
