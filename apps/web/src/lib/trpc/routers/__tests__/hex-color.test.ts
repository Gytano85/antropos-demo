import { describe, expect, it } from "bun:test";
import { normalizeHexColor } from "../../../settings/hex-color";

describe("normalizeHexColor", () => {
	it("accepts a full hex with or without the hash", () => {
		expect(normalizeHexColor("#1A2B3C")).toBe("#1a2b3c");
		expect(normalizeHexColor("1a2b3c")).toBe("#1a2b3c");
	});

	it("expands the three digit form", () => {
		expect(normalizeHexColor("#abc")).toBe("#aabbcc");
	});

	it("ignores surrounding whitespace", () => {
		expect(normalizeHexColor("  #ffffff  ")).toBe("#ffffff");
	});

	it("rejects a half typed value instead of sending it to the server", () => {
		// Es el estado por el que se pasa al corregir un digito; antes llegaba al
		// servidor y volvia como error de guardado.
		expect(normalizeHexColor("#11182")).toBeNull();
		expect(normalizeHexColor("")).toBeNull();
		expect(normalizeHexColor("rojo")).toBeNull();
		expect(normalizeHexColor("#12345g")).toBeNull();
	});
});
