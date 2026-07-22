"use client";

import { Button } from "@finopenpos/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@finopenpos/ui/components/dropdown-menu";
import { Building2Icon, LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/login/actions";

/** Etiquetas de rol; coinciden con `ROLE_LABELS` de branches/permissions. */
const ROLE_LABELS: Record<string, string> = {
	owner: "Propietario",
	admin: "Administrador",
	manager: "Gerente",
	cashier: "Cajero",
	server: "Mesero",
	inventory: "Inventario",
	auditor: "Auditor",
};

export function UserMenu({
	name,
	email,
	branchName,
	role,
	canManageSettings,
}: {
	name?: string | null;
	email?: string | null;
	branchName?: string | null;
	role?: string | null;
	canManageSettings?: boolean;
}) {
	const label = name?.trim() || email?.split("@")[0] || "Cuenta";
	const initials = label
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="shrink-0 rounded-full"
					aria-label="Abrir menú de cuenta"
				>
					<span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
						{initials || "?"}
					</span>
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="font-normal">
					<span className="block truncate font-medium text-sm">{label}</span>
					{email ? (
						<span className="block truncate text-muted-foreground text-xs">
							{email}
						</span>
					) : null}
					{role || branchName ? (
						<span className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
							{role ? (
								<span className="rounded bg-muted px-1.5 py-0.5 font-medium">
									{ROLE_LABELS[role] ?? role}
								</span>
							) : null}
							{branchName ? <span>{branchName}</span> : null}
						</span>
					) : null}
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				<DropdownMenuItem asChild>
					<Link href="/branches">
						<Building2Icon className="mr-2 h-4 w-4" />
						Cambiar sucursal
					</Link>
				</DropdownMenuItem>

				{canManageSettings ? (
					<DropdownMenuItem asChild>
						<Link href="/admin/settings">
							<SettingsIcon className="mr-2 h-4 w-4" />
							Configuración
						</Link>
					</DropdownMenuItem>
				) : null}

				<DropdownMenuSeparator />

				{/* Server action: cierra la sesión y limpia las cookies de demo y de
				    sucursal activa, que si no sobreviven al siguiente acceso. */}
				<form action={logout}>
					<button
						type="submit"
						className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-accent"
					>
						<LogOutIcon className="mr-2 h-4 w-4" />
						Cerrar sesión
					</button>
				</form>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
