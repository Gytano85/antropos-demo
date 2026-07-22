"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import {
	BeerIcon,
	BriefcaseIcon,
	CheckIcon,
	ClipboardListIcon,
	CrownIcon,
	PackageIcon,
	WalletIcon,
} from "lucide-react";
import { useState } from "react";

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
		icon: CrownIcon,
		branches: ["Centro", "Norte"],
	},
	{
		email: "gerente@example.com",
		role: "Gerente",
		icon: BriefcaseIcon,
		branches: ["Centro"],
	},
	{
		email: "cajero@example.com",
		role: "Cajero",
		icon: WalletIcon,
		branches: ["Centro"],
	},
	{
		email: "mesero@example.com",
		role: "Mesero",
		icon: BeerIcon,
		branches: ["Norte"],
	},
	{
		email: "inventario@example.com",
		role: "Inventario",
		icon: PackageIcon,
		branches: ["Centro", "Norte"],
	},
	{
		email: "auditor@example.com",
		role: "Auditor",
		icon: ClipboardListIcon,
		branches: ["Norte"],
	},
] as const;

export const TEST_PASSWORD = "test1234";

export function TestAccountPicker() {
	const [selected, setSelected] = useState<string | null>(null);

	/**
	 * Rellena el formulario en lugar de enviarlo: así se ve qué credenciales se
	 * van a usar antes de entrar, y sigue siendo posible escribir otras.
	 */
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
		setSelected(email);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<div className="h-px flex-1 bg-border" />
				<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
					Cuentas de prueba
				</span>
				<div className="h-px flex-1 bg-border" />
			</div>

			<div className="grid gap-1.5 sm:grid-cols-2">
				{TEST_ACCOUNTS.map((account) => {
					const Icon = account.icon;
					const isSelected = selected === account.email;
					return (
						<button
							key={account.email}
							type="button"
							onClick={() => fill(account.email)}
							aria-pressed={isSelected}
							className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
								isSelected
									? "border-primary bg-primary/5"
									: "border-transparent bg-muted/50 hover:border-border hover:bg-muted"
							}`}
						>
							<span
								className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
									isSelected
										? "bg-primary text-primary-foreground"
										: "bg-background text-muted-foreground group-hover:text-foreground"
								}`}
							>
								{isSelected ? (
									<CheckIcon className="h-3.5 w-3.5" />
								) : (
									<Icon className="h-3.5 w-3.5" />
								)}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-[13px] leading-tight">
									{account.role}
								</span>
								<span className="mt-0.5 flex flex-wrap gap-1">
									{account.branches.map((branch) => (
										<Badge
											key={branch}
											variant="secondary"
											className="px-1.5 py-0 font-normal text-[10px] leading-4"
										>
											{branch}
										</Badge>
									))}
								</span>
							</span>
						</button>
					);
				})}
			</div>

			<p className="text-center text-[11px] text-muted-foreground">
				Contraseña compartida{" "}
				<code className="rounded bg-muted px-1 py-0.5 font-mono">
					{TEST_PASSWORD}
				</code>
			</p>
		</div>
	);
}
