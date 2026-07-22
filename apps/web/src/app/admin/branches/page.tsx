"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@finopenpos/ui/components/card";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2Icon, CheckIcon, MapPinIcon, PlusIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	BRANCH_PERMISSIONS,
	BRANCH_ROLES,
	PERMISSION_LABELS,
	ROLE_LABELS,
	type BranchPermission,
	type BranchRole,
} from "@/lib/branches/permissions";
import { useTRPC } from "@/lib/trpc/client";

type Tab = "branches" | "members" | "roles";

export default function BranchesPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<Tab>("branches");
	const { data: branches = [] } = useQuery(trpc.branches.listMine.queryOptions());
	const { data: active } = useQuery(trpc.branches.active.queryOptions());
	const activeId = active?.id ?? 0;
	const canManage = active?.permissions.includes("branches.manage") ?? false;
	const refresh = () => queryClient.invalidateQueries(trpc.branches.listMine.queryOptions());

	return <div className="mx-auto max-w-6xl space-y-6">
		<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Building2Icon className="h-6 w-6 text-primary" />Sucursales y accesos</h1><p className="text-sm text-muted-foreground">Administra sedes, usuarios y permisos sin mezclar la operación de cada sucursal.</p></div><Badge variant="secondary">Sucursal activa: {active?.name}</Badge></div>
		<div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-3">{([ ["branches", Building2Icon, "Sucursales"], ["members", UsersIcon, "Usuarios"], ["roles", ShieldCheckIcon, "Roles y permisos"] ] as const).map(([id, Icon, label]) => <Button key={id} variant={tab === id ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setTab(id)}><Icon className="h-4 w-4" />{label}</Button>)}</div>
		{!canManage ? <Card><CardContent className="p-8 text-center text-muted-foreground">Tu rol puede usar esta sucursal, pero no administrar usuarios ni permisos.</CardContent></Card> : null}
		{tab === "branches" && <BranchesTab branches={branches} canManage={canManage} onRefresh={refresh} />}
		{tab === "members" && canManage && activeId > 0 && <MembersTab branchId={activeId} />}
		{tab === "roles" && canManage && activeId > 0 && <RolesTab branchId={activeId} />}
	</div>;
}

function BranchesTab({ branches, canManage, onRefresh }: { branches: Array<{ id: number; name: string; code: string; address: string | null; role: string; status: string; productCount: number; openOrderCount: number }>; canManage: boolean; onRefresh: () => void }) {
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState({ name: "", code: "", address: "", phone: "" });
	const create = useMutation(trpc.branches.create.mutationOptions({ onSuccess: () => { toast.success("Sucursal creada"); setOpen(false); setForm({ name: "", code: "", address: "", phone: "" }); onRefresh(); }, onError: (error) => toast.error(error.message) }));
	return <div className="space-y-4">
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{branches.map((branch) => <Card key={branch.id}><CardHeader className="pb-3"><div className="flex justify-between gap-2"><div><CardTitle>{branch.name}</CardTitle><CardDescription>{branch.code}</CardDescription></div><Badge variant={branch.status === "active" ? "default" : "secondary"}>{ROLE_LABELS[branch.role as BranchRole] ?? branch.role}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="flex min-h-10 items-start gap-2 text-sm text-muted-foreground"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />{branch.address || "Dirección pendiente"}</p><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-muted p-3"><strong className="block text-lg">{branch.productCount}</strong>productos</div><div className="rounded-lg bg-muted p-3"><strong className="block text-lg">{branch.openOrderCount}</strong>comandas</div></div></CardContent></Card>)}</div>
		{canManage && !open && <Button onClick={() => setOpen(true)}><PlusIcon className="mr-2 h-4 w-4" />Nueva sucursal</Button>}
		{open && <Card><CardHeader><CardTitle>Nueva sucursal</CardTitle><CardDescription>La nueva sede iniciará con inventario y operación independientes.</CardDescription></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="Sucursal Polanco" /><Field label="Código" value={form.code} onChange={(code) => setForm({ ...form, code })} placeholder="POLANCO" /><Field label="Dirección" value={form.address} onChange={(address) => setForm({ ...form, address })} placeholder="Av. Presidente Masaryk 100" /><Field label="Teléfono" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} placeholder="55 0000 0000" /></div><div className="mt-5 flex gap-2"><Button disabled={create.isPending || !form.name || !form.code} onClick={() => create.mutate(form)}>Crear sucursal</Button><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button></div></CardContent></Card>}
	</div>;
}

function MembersTab({ branchId }: { branchId: number }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Exclude<BranchRole, "owner">>("server");
	const query = trpc.branches.members.queryOptions({ branchId });
	const { data: members = [] } = useQuery(query);
	const refresh = () => queryClient.invalidateQueries(query);
	const add = useMutation(trpc.branches.addMember.mutationOptions({ onSuccess: () => { toast.success("Usuario agregado"); setEmail(""); refresh(); }, onError: (error) => toast.error(error.message) }));
	const update = useMutation(trpc.branches.updateMember.mutationOptions({ onSuccess: () => { toast.success("Acceso actualizado"); refresh(); }, onError: (error) => toast.error(error.message) }));
	return <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
		<Card><CardHeader><CardTitle>Equipo con acceso</CardTitle><CardDescription>El rol se aplica únicamente en esta sucursal.</CardDescription></CardHeader><CardContent className="space-y-3">{members.map((member) => <div key={member.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium">{member.name}</p><p className="truncate text-sm text-muted-foreground">{member.email}</p></div>{member.role === "owner" ? <Badge>Propietario</Badge> : <><select className="h-9 rounded-md border bg-background px-3 text-sm" value={member.role} onChange={(event) => update.mutate({ branchId, membershipId: member.id, role: event.target.value as Exclude<BranchRole, "owner">, status: member.status as "active" | "inactive" })}>{BRANCH_ROLES.filter((item) => item !== "owner").map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select><Button size="sm" variant={member.status === "active" ? "outline" : "default"} onClick={() => update.mutate({ branchId, membershipId: member.id, role: member.role as Exclude<BranchRole, "owner">, status: member.status === "active" ? "inactive" : "active" })}>{member.status === "active" ? "Suspender" : "Activar"}</Button></>}</div>)}</CardContent></Card>
		<Card className="h-fit"><CardHeader><CardTitle>Agregar usuario</CardTitle><CardDescription>Debe haberse registrado previamente con ese correo.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="Correo" value={email} onChange={setEmail} placeholder="persona@empresa.com" /><div className="space-y-2"><Label>Rol</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as Exclude<BranchRole, "owner">)}>{BRANCH_ROLES.filter((item) => item !== "owner").map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></div><Button className="w-full" disabled={!email || add.isPending} onClick={() => add.mutate({ branchId, email, role })}><PlusIcon className="mr-2 h-4 w-4" />Agregar acceso</Button></CardContent></Card>
	</div>;
}

function RolesTab({ branchId }: { branchId: number }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const query = trpc.branches.roleMatrix.queryOptions({ branchId });
	const { data: matrix = [] } = useQuery(query);
	const [drafts, setDrafts] = useState<Record<string, BranchPermission[]>>({});
	const update = useMutation(trpc.branches.updateRole.mutationOptions({ onSuccess: () => { toast.success("Permisos guardados"); queryClient.invalidateQueries(query); }, onError: (error) => toast.error(error.message) }));
	return <div className="space-y-4"><Card><CardHeader><CardTitle>Matriz de permisos</CardTitle><CardDescription>Define qué puede ver y modificar cada rol. El propietario siempre conserva acceso total.</CardDescription></CardHeader></Card>
		{matrix.map((row) => { const permissions = drafts[row.role] ?? row.permissions as BranchPermission[]; return <Card key={row.role}><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle>{ROLE_LABELS[row.role as BranchRole]}</CardTitle><CardDescription>{row.isDefault ? "Configuración recomendada" : "Configuración personalizada"}</CardDescription></div>{row.role === "owner" && <Badge>Acceso total</Badge>}</div></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{BRANCH_PERMISSIONS.map((permission) => { const checked = permissions.includes(permission); return <button key={permission} type="button" disabled={row.role === "owner"} onClick={() => setDrafts({ ...drafts, [row.role]: checked ? permissions.filter((item) => item !== permission) : [...permissions, permission] })} className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${checked ? "border-primary bg-primary/5" : "text-muted-foreground"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}>{checked && <CheckIcon className="h-3.5 w-3.5" />}</span>{PERMISSION_LABELS[permission]}</button>; })}</div>{row.role !== "owner" && <Button className="mt-4" disabled={update.isPending} onClick={() => update.mutate({ branchId, role: row.role as Exclude<BranchRole, "owner">, permissions })}>Guardar permisos de {ROLE_LABELS[row.role as BranchRole]}</Button>}</CardContent></Card>; })}
	</div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
	return <div className="space-y-2"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}
