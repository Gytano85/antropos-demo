export type BottleScaleStatus = "ok" | "review" | "critical";

export type BottleScaleReading = {
	bottleName: string;
	emptyBottleWeightG: number;
	fullVolumeMl: number;
	densityGPerMl: number;
	currentWeightG: number;
	expectedUsedMl: number;
	toleranceMl: number;
};

export type BottleScaleEvaluation = {
	bottleName: string;
	currentVolumeMl: number;
	physicalUsedMl: number;
	expectedUsedMl: number;
	differenceMl: number;
	toleranceMl: number;
	remainingPct: number;
	status: BottleScaleStatus;
	message: string;
};

export function evaluateBottleScale(
	reading: BottleScaleReading,
): BottleScaleEvaluation {
	const liquidWeightG = Math.max(
		0,
		reading.currentWeightG - reading.emptyBottleWeightG,
	);
	const currentVolumeMl = round1(liquidWeightG / reading.densityGPerMl);
	const physicalUsedMl = round1(
		Math.max(0, reading.fullVolumeMl - currentVolumeMl),
	);
	const differenceMl = round1(physicalUsedMl - reading.expectedUsedMl);
	const absDifference = Math.abs(differenceMl);
	const remainingPct = Math.max(
		0,
		Math.min(100, Math.round((currentVolumeMl / reading.fullVolumeMl) * 100)),
	);
	const status: BottleScaleStatus =
		absDifference <= reading.toleranceMl
			? "ok"
			: absDifference > reading.toleranceMl * 2
				? "critical"
				: "review";

	return {
		bottleName: reading.bottleName,
		currentVolumeMl,
		physicalUsedMl,
		expectedUsedMl: reading.expectedUsedMl,
		differenceMl,
		toleranceMl: reading.toleranceMl,
		remainingPct,
		status,
		message: messageFor(status, differenceMl),
	};
}

function messageFor(status: BottleScaleStatus, differenceMl: number) {
	if (status === "ok") return "Consumo físico compatible con ventas/recetas.";
	if (differenceMl > 0) {
		return "La botella bajó más de lo que justifican las ventas.";
	}
	return "El POS esperaba más consumo que el detectado físicamente.";
}

function round1(value: number) {
	return Math.round(value * 10) / 10;
}
