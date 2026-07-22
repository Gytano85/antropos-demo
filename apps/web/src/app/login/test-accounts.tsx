"use client";

import { Button } from "@finopenpos/ui/components/button";

/**
 * Cuentas sembradas por `seed.ts`. Todas comparten contraseña porque solo
 * existen en el entorno de demostración.
 *
 * Las membresías son asimétricas a propósito: hay cuentas en una sola sucursal
 * y otras en las dos, para poder comprobar de un vistazo que el aislamiento por
 * sucursal y los permisos por rol se comportan como deben.
 */
export const TEST_ACCOUNTS = [
	{
		email: "test@example.com",
		role: "Propietario",
		scope: "Centro y Norte",
	},
	{ email: "gerente@example.com", role: "Gerente", scope: "Centro" },
	{ email: "cajero@example.com", role: "Cajero", scope: "Centro" },
	{ email: "mesero@example.com", role: "Mesero", scope: "Norte" },
	{
		email: "inventario@example.com",
		role: "Inventario",
		scope: "Centro y Norte",
	},
	{ email: "auditor@example.com", role: "Auditor", scope: "Norte" },
] as const;

export const TEST_PASSWORD = "test1234";

/**
 * Rellena el formulario en lugar de enviarlo: así se ve qué credenciales se van
 * a usar antes de entrar, y sigue siendo posible escribir otras.
 */
export function TestAccountPicker() {
	const fill = (email: string) => {
		const form = document.querySelector("form");
		const emailInput = form?.querySelector<HTMLInputElement>("#email");
		const passwordInput = form?.querySelector<HTMLInputElement>("#password");
		if (!emailInput || !passwordInput) return;

		// Asignar `.value` directamente no notifica a React; el setter nativo sí.
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		for (const [input, value] of [
			[emailInput, email],
			[passwordInput, TEST_PASSWORD],
		] as const) {
			setter?.call(input, value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
	};

	return (
		<div className="rounded-xl border bg-muted/40 p-3">
			<p className="mb-2 text-muted-foreground text-xs">
				Cuentas de prueba · contraseña{" "}
				<span className="font-mono">{TEST_PASSWORD}</span>
			</p>
			<div className="grid gap-1.5 sm:grid-cols-2">
				{TEST_ACCOUNTS.map((account) => (
					<Button
						key={account.email}
						type="button"
						variant="outline"
						size="sm"
						className="h-auto flex-col items-start gap-0.5 py-1.5 text-left"
						onClick={() => fill(account.email)}
					>
						<span className="font-medium text-xs">{account.role}</span>
						<span className="font-normal text-[11px] text-muted-foreground">
							{account.scope}
						</span>
					</Button>
				))}
			</div>
		</div>
	);
}
