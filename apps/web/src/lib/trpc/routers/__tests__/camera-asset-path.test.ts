import { afterEach, describe, expect, it } from "bun:test";
import { cameraAssetPath } from "../../../cameras/asset-path";

const original = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
	if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
	else process.env.NEXT_PUBLIC_BASE_PATH = original;
});

describe("camera asset paths", () => {
	it("leaves paths untouched when the app is served at the root", () => {
		delete process.env.NEXT_PUBLIC_BASE_PATH;
		expect(cameraAssetPath("/models/yolov8n-416.onnx")).toBe(
			"/models/yolov8n-416.onnx",
		);
		expect(cameraAssetPath("/ort/")).toBe("/ort/");
	});

	it("prefixes the base path when the app lives in a subdirectory", () => {
		// Sin esto los pesos y el runtime daban 404 y el detector reportaba
		// "no pudo iniciar" sin decir por que.
		process.env.NEXT_PUBLIC_BASE_PATH = "/pos";
		expect(cameraAssetPath("/models/yolov8n-416.onnx")).toBe(
			"/pos/models/yolov8n-416.onnx",
		);
		expect(cameraAssetPath("/ort/")).toBe("/pos/ort/");
	});

	it("normalises a path given without a leading slash", () => {
		process.env.NEXT_PUBLIC_BASE_PATH = "/pos";
		expect(cameraAssetPath("ort/")).toBe("/pos/ort/");
	});
});
