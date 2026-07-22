/**
 * Normaliza un color escrito a mano a `#rrggbb`.
 *
 * El formulario de apariencia deja teclear el color libremente, asi que pasa por
 * estados intermedios invalidos (`#11182` mientras se corrige un digito). Antes
 * eso llegaba tal cual al servidor y volvia como error; aqui se acepta lo que es
 * interpretable y se rechaza lo que no.
 */
export function normalizeHexColor(input: string): string | null {
	const value = input.trim().replace(/^#/, "").toLowerCase();

	// Forma corta: `abc` equivale a `aabbcc`.
	if (/^[0-9a-f]{3}$/.test(value)) {
		return `#${value
			.split("")
			.map((digit) => digit + digit)
			.join("")}`;
	}

	if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;

	return null;
}

/** Mensaje para el campo cuando el valor no se puede interpretar. */
export const HEX_COLOR_HINT = "Usa un color como #1a2b3c o #abc.";
