import { describe, expect, it } from "bun:test";
import { evaluateBottleScale } from "../../../alcohol-control/scale-engine";

describe("alcohol scale engine", () => {
	it("marks a bottle as ok when physical usage matches expected usage", () => {
		const result = evaluateBottleScale({
			bottleName: "Don Julio 70",
			emptyBottleWeightG: 610,
			fullVolumeMl: 700,
			densityGPerMl: 0.95,
			currentWeightG: 1146.75,
			expectedUsedMl: 135,
			toleranceMl: 45,
		});

		expect(result.status).toBe("ok");
		expect(result.physicalUsedMl).toBe(135);
		expect(result.differenceMl).toBe(0);
	});

	it("marks a bottle as critical when physical usage doubles tolerance", () => {
		const result = evaluateBottleScale({
			bottleName: "Buchanan's 12",
			emptyBottleWeightG: 650,
			fullVolumeMl: 750,
			densityGPerMl: 0.94,
			currentWeightG: 1100,
			expectedUsedMl: 90,
			toleranceMl: 45,
		});

		expect(result.status).toBe("critical");
		expect(result.differenceMl).toBeGreaterThan(90);
		expect(result.message).toContain("bajó más");
	});
});
