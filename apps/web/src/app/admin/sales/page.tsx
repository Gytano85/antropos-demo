"use client";

import { Button } from "@finopenpos/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { DollarSignIcon, ShoppingBagIcon, UsersIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { CashierSection } from "../cashier/section";
import { CustomersSection } from "../customers/section";
import { OrdersSection } from "../orders/section";

/**
 * Caja, Pedidos y Clientes en un solo módulo.
 *
 * Cada pestaña conserva el permiso que tenía como página suelta: Caja y Pedidos
 * dependen de `sales.view`, pero Clientes exige `customers.manage`. Un mesero
 * tiene el primero y no el segundo, así que agruparlas sin filtrar le habría
 * abierto Clientes.
 */
const tabs = [
	{
		id: "cashier",
		label: "Caja",
		icon: DollarSignIcon,
		permission: "sales.view",
	},
	{
		id: "orders",
		label: "Pedidos",
		icon: ShoppingBagIcon,
		permission: "sales.view",
	},
	{
		id: "customers",
		label: "Clientes",
		icon: UsersIcon,
		permission: "customers.manage",
	},
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function SalesPage() {
	const trpc = useTRPC();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: activeBranch } = useQuery(trpc.branches.active.queryOptions());

	const permissions = activeBranch?.permissions;
	const allowed = tabs.filter(
		(tab) => permissions?.includes(tab.permission) ?? false,
	);

	const requested = searchParams.get("tab") as TabId | null;
	const active =
		allowed.find((tab) => tab.id === requested)?.id ?? allowed[0]?.id ?? null;

	useEffect(() => {
		// Una pestaña pedida por URL sin permiso no debe quedarse en la barra de
		// direcciones dando a entender que existe.
		if (requested && active && requested !== active) {
			router.replace(`/admin/sales?tab=${active}`, { scroll: false });
		}
	}, [requested, active, router]);

	if (!permissions) {
		return <div className="text-muted-foreground">Cargando…</div>;
	}

	if (!active) {
		return (
			<div className="text-muted-foreground">
				No tienes acceso a caja, pedidos ni clientes en esta sucursal.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Con una sola pestaña permitida la barra sobra: no hay nada entre lo
			    que elegir y solo robaría espacio. */}
			{allowed.length > 1 ? (
				<div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-3">
					{allowed.map(({ id, label, icon: Icon }) => (
						<Button
							key={id}
							type="button"
							variant={active === id ? "default" : "ghost"}
							className="justify-start gap-2"
							onClick={() =>
								router.replace(`/admin/sales?tab=${id}`, { scroll: false })
							}
						>
							<Icon className="h-4 w-4" />
							{label}
						</Button>
					))}
				</div>
			) : null}

			{active === "cashier" && <CashierSection />}
			{active === "orders" && <OrdersSection />}
			{active === "customers" && <CustomersSection />}
		</div>
	);
}
