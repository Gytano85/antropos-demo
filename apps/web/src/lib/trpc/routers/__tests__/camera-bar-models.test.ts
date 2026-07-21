import { describe, expect, it } from "bun:test";
import {
	BEVERAGE_MODEL,
	COCO_CLASSES,
	COCO_MODEL,
	resolveAvailableBarModel,
} from "../../../cameras/bar-models";

describe("bar model registry", () => {
	it("keeps the COCO class order that the ONNX metadata declares", () => {
		expect(COCO_CLASSES).toHaveLength(80);
		expect(COCO_CLASSES[39]).toBe("bottle");
		expect(COCO_CLASSES[40]).toBe("wine glass");
		expect(COCO_CLASSES[41]).toBe("cup");
		expect(COCO_CLASSES[45]).toBe("bowl");
		expect(COCO_CLASSES[29]).toBe("frisbee");
	});

	it("prefers the specialised beverage model when its weights exist", async () => {
		const model = await resolveAvailableBarModel((async () => ({
			ok: true,
		})) as unknown as typeof fetch);
		expect(model.id).toBe(BEVERAGE_MODEL.id);
	});

	it("falls back to COCO while the beverage weights are missing", async () => {
		const model = await resolveAvailableBarModel((async (url: string) => ({
			ok: String(url).includes("yolov8n"),
		})) as unknown as typeof fetch);
		expect(model.id).toBe(COCO_MODEL.id);
	});

	it("falls back to COCO when the probe request throws", async () => {
		const model = await resolveAvailableBarModel((() => {
			throw new Error("offline");
		}) as unknown as typeof fetch);
		expect(model.id).toBe(COCO_MODEL.id);
	});
});
