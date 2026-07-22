"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent } from "@finopenpos/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Building2Icon, MapPinIcon, PackageIcon, ReceiptTextIcon, ShieldCheckIcon } from "lucide-react";
import { ROLE_LABELS, type BranchRole } from "@/lib/branches/permissions";
import { useTRPC } from "@/lib/trpc/client";
import { selectBranch } from "./actions";

export default function BranchSelectorPage() {
	const trpc = useTRPC();
	const { data: branches = [], isLoading } = useQuery(trpc.branches.listMine.queryOptions());
	return <div className="min-h-screen bg-muted/40 px-4 py-10"><div className="mx-auto max-w-6xl space-y-8">
		<div className="space-y-2 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Building2Icon className="h-6 w-6" /></div><h1 className="text-3xl font-bold tracking-tight">Selecciona una sucursal</h1><p className="text-muted-foreground">Cada sucursal mantiene separados su inventario, comandas, cámaras y reportes.</p></div>
		{isLoading ? <div className="py-20 text-center text-muted-foreground">Cargando sucursales...</div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{branches.map((branch) => <Card key={branch.id} className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"><div className="h-2 bg-primary" /><CardContent className="space-y-5 p-6">
			<div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{branch.organizationName}</p><h2 className="mt-1 text-xl font-semibold">{branch.name}</h2></div><Badge variant="secondary">{ROLE_LABELS[branch.role as BranchRole] ?? branch.role}</Badge></div>
			<div className="space-y-2 text-sm text-muted-foreground"><div className="flex items-center gap-2"><MapPinIcon className="h-4 w-4" />{branch.address || "Dirección pendiente"}</div><div className="flex items-center gap-2"><ShieldCheckIcon className="h-4 w-4" />Código {branch.code}</div></div>
			<div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-3"><PackageIcon className="mb-1 h-4 w-4 text-primary" /><strong className="block text-lg text-foreground">{branch.productCount}</strong><span className="text-xs text-muted-foreground">productos</span></div><div className="rounded-xl bg-muted p-3"><ReceiptTextIcon className="mb-1 h-4 w-4 text-primary" /><strong className="block text-lg text-foreground">{branch.openOrderCount}</strong><span className="text-xs text-muted-foreground">comandas abiertas</span></div></div>
			<form action={selectBranch}><input type="hidden" name="branchId" value={branch.id} /><Button className="w-full" size="lg">Entrar a esta sucursal</Button></form>
		</CardContent></Card>)}</div>}
	</div></div>;
}
