/** Convierte un color hex (#rrggbb) al formato "H S% L%" que usan las
 * variables CSS de shadcn (--primary: 222.2 47.4% 11.2%, etc). */
export function hexToHslString(hex: string): string | null {
	const match = /^#?([a-f\d]{6})$/i.exec(hex.trim());
	if (!match) return null;

	const int = Number.parseInt(match[1], 16);
	const r = ((int >> 16) & 255) / 255;
	const g = ((int >> 8) & 255) / 255;
	const b = (int & 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;

	if (max !== min) {
		const d = max - min;
		s = d / (1 - Math.abs(2 * l - 1));
		switch (max) {
			case r:
				h = ((g - b) / d) % 6;
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h *= 60;
		if (h < 0) h += 360;
	}

	return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

/** Decide si el texto sobre este color debe ser claro u oscuro. */
export function isHexDark(hex: string): boolean {
	const match = /^#?([a-f\d]{6})$/i.exec(hex.trim());
	if (!match) return false;
	const int = Number.parseInt(match[1], 16);
	const r = (int >> 16) & 255;
	const g = (int >> 8) & 255;
	const b = int & 255;
	// Luminancia relativa aproximada.
	return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}
