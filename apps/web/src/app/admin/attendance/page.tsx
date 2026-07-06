"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@finopenpos/ui/components/card";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@finopenpos/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	Clock3Icon,
	MapPinIcon,
	QrCodeIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	UserCheckIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export default function AttendancePage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(trpc.attendance.overview.queryOptions());
	const [purpose, setPurpose] = useState<"check_in" | "check_out">("check_in");
	const [qr, setQr] = useState<{ url: string; expiresAt: string } | null>(null);
	const [settingsDraft, setSettingsDraft] = useState({
		locationName: "",
		latitude: "",
		longitude: "",
		allowedRadiusMeters: 100,
		requireLocation: false,
		requirePin: true,
		qrTtlSeconds: 60,
	});

	useEffect(() => {
		if (!data?.settings) return;
		setSettingsDraft({
			locationName: data.settings.locationName,
			latitude: data.settings.latitude?.toString() ?? "",
			longitude: data.settings.longitude?.toString() ?? "",
			allowedRadiusMeters: data.settings.allowedRadiusMeters,
			requireLocation: data.settings.requireLocation,
			requirePin: data.settings.requirePin,
			qrTtlSeconds: data.settings.qrTtlSeconds,
		});
	}, [data?.settings]);

	const generateQr = useMutation(
		trpc.attendance.generateQr.mutationOptions({
			onSuccess: (result) => {
				setQr(result);
				toast.success("QR generado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const updateSettings = useMutation(
		trpc.attendance.updateSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.attendance.overview.queryOptions());
				toast.success("Configuracion guardada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const fullQrUrl =
		qr && typeof window !== "undefined" ? `${window.location.origin}${qr.url}` : "";
	const qrImage = fullQrUrl
		? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(fullQrUrl)}`
		: "";

	const saveSettings = () => {
		updateSettings.mutate({
			locationName: settingsDraft.locationName || "Antro",
			latitude: settingsDraft.latitude ? Number(settingsDraft.latitude) : null,
			longitude: settingsDraft.longitude ? Number(settingsDraft.longitude) : null,
			allowedRadiusMeters: Number(settingsDraft.allowedRadiusMeters),
			requireLocation: settingsDraft.requireLocation,
			requirePin: settingsDraft.requirePin,
			qrTtlSeconds: Number(settingsDraft.qrTtlSeconds),
		});
	};

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<UserCheckIcon className="h-6 w-6 text-primary" />
							<h1 className="font-bold text-2xl">Asistencia de empleados</h1>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Check-in con QR dinamico, PIN y validacion opcional por radio.
						</p>
					</div>
					<Badge variant="outline">PIN demo: 1234</Badge>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-5">
				<Metric icon={UsersIcon} label="Esperados" value={data?.summary.expected ?? "..."} />
				<Metric icon={CheckCircle2Icon} label="Registrados" value={data?.summary.checkedIn ?? "..."} />
				<Metric icon={Clock3Icon} label="Tarde" value={data?.summary.late ?? "..."} />
				<Metric icon={AlertTriangleIcon} label="Pendientes" value={data?.summary.pending ?? "..."} />
				<Metric icon={ShieldCheckIcon} label="Rechazados" value={data?.summary.rejected ?? "..."} />
			</div>

			<div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<QrCodeIcon className="h-5 w-5" /> QR dinamico
						</CardTitle>
						<CardDescription>
							El QR expira rapido. Si alguien manda captura, el radio puede bloquear el intento remoto.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
							<Select value={purpose} onValueChange={(value) => setPurpose(value as "check_in" | "check_out")}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="check_in">Entrada</SelectItem>
									<SelectItem value="check_out">Salida</SelectItem>
								</SelectContent>
							</Select>
							<Button onClick={() => generateQr.mutate({ purpose })} disabled={generateQr.isPending}>
								<RefreshCwIcon className="mr-2 h-4 w-4" />
								Generar QR
							</Button>
						</div>
						<div className="flex min-h-[300px] items-center justify-center rounded-xl border bg-white p-4">
							{qrImage ? (
								<div className="space-y-3 text-center">
									<img src={qrImage} alt="QR de asistencia" className="mx-auto h-[260px] w-[260px]" />
									<p className="break-all text-muted-foreground text-xs">{fullQrUrl}</p>
									<p className="text-xs">Expira: {new Date(qr?.expiresAt ?? "").toLocaleTimeString()}</p>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">Genera un QR para entrada o salida.</p>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MapPinIcon className="h-5 w-5" /> Antifraude y radio
						</CardTitle>
						<CardDescription>
							Activa ubicacion para impedir check-ins desde casa aunque reciban una foto del QR.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2 md:col-span-2">
							<Label>Nombre del local</Label>
							<Input value={settingsDraft.locationName} onChange={(e) => setSettingsDraft({ ...settingsDraft, locationName: e.target.value })} />
						</div>
						<div className="space-y-2">
							<Label>Latitud</Label>
							<Input value={settingsDraft.latitude} onChange={(e) => setSettingsDraft({ ...settingsDraft, latitude: e.target.value })} placeholder="19.4326" />
						</div>
						<div className="space-y-2">
							<Label>Longitud</Label>
							<Input value={settingsDraft.longitude} onChange={(e) => setSettingsDraft({ ...settingsDraft, longitude: e.target.value })} placeholder="-99.1332" />
						</div>
						<div className="space-y-2">
							<Label>Radio permitido (metros)</Label>
							<Input type="number" value={settingsDraft.allowedRadiusMeters} onChange={(e) => setSettingsDraft({ ...settingsDraft, allowedRadiusMeters: Number(e.target.value) })} />
						</div>
						<div className="space-y-2">
							<Label>Duracion QR (segundos)</Label>
							<Input type="number" value={settingsDraft.qrTtlSeconds} onChange={(e) => setSettingsDraft({ ...settingsDraft, qrTtlSeconds: Number(e.target.value) })} />
						</div>
						<label className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
							<span>
								<span className="block font-medium">Requerir ubicacion</span>
								<span className="text-muted-foreground text-xs">Si se activa, el empleado debe estar dentro del radio.</span>
							</span>
							<input
								type="checkbox"
								className="h-5 w-5"
								checked={settingsDraft.requireLocation}
								onChange={(event) =>
									setSettingsDraft({
										...settingsDraft,
										requireLocation: event.target.checked,
									})
								}
							/>
						</label>
						<label className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
							<span>
								<span className="block font-medium">Requerir PIN</span>
								<span className="text-muted-foreground text-xs">Capa extra contra compañeros marcando por otros.</span>
							</span>
							<input
								type="checkbox"
								className="h-5 w-5"
								checked={settingsDraft.requirePin}
								onChange={(event) =>
									setSettingsDraft({
										...settingsDraft,
										requirePin: event.target.checked,
									})
								}
							/>
						</label>
						<Button onClick={saveSettings} disabled={updateSettings.isPending} className="md:col-span-2">
							Guardar configuracion
						</Button>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Asistencia de hoy</CardTitle>
					<CardDescription>Empleados esperados, entrada real y estado del turno.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Empleado</TableHead>
									<TableHead>Puesto</TableHead>
									<TableHead>Turno</TableHead>
									<TableHead>Entrada esperada</TableHead>
									<TableHead>Entrada real</TableHead>
									<TableHead>Estado</TableHead>
									<TableHead>Salida</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data?.rows ?? []).map((row) => (
									<TableRow key={row.assignment.id}>
										<TableCell className="font-medium">{row.employee?.name}</TableCell>
										<TableCell>{row.employee?.role}</TableCell>
										<TableCell>{row.shift?.name}</TableCell>
										<TableCell>{new Date(row.assignment.expected_start_at).toLocaleTimeString()}</TableCell>
										<TableCell>{row.record?.check_in_at ? new Date(row.record.check_in_at).toLocaleTimeString() : "-"}</TableCell>
										<TableCell><StatusBadge status={row.status} /></TableCell>
										<TableCell>{row.record?.check_out_at ? new Date(row.record.check_out_at).toLocaleTimeString() : "-"}</TableCell>
									</TableRow>
								))}
								{!isLoading && !data?.rows.length && (
									<TableRow>
										<TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin turnos para hoy.</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Intentos recientes</CardTitle>
					<CardDescription>Auditoria de intentos rechazados o sospechosos.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{(data?.attempts ?? []).map((attempt) => (
						<div key={attempt.id} className="rounded-lg border p-3 text-sm">
							<p className="font-medium">{attempt.result} · {attempt.reason ?? "Sin detalle"}</p>
							<p className="text-muted-foreground text-xs">{new Date(attempt.created_at ?? "").toLocaleString()}</p>
						</div>
					))}
					{!data?.attempts.length && <p className="text-muted-foreground text-sm">Sin intentos recientes.</p>}
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersIcon; label: string; value: string | number }) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-3xl">{value}</p>
				</div>
				<Icon className="h-7 w-7 text-primary" />
			</CardContent>
		</Card>
	);
}

function StatusBadge({ status }: { status: string }) {
	if (status === "Tarde") return <Badge className="bg-amber-100 text-amber-800">{status}</Badge>;
	if (status === "A tiempo") return <Badge className="bg-emerald-100 text-emerald-800">{status}</Badge>;
	return <Badge variant="outline">{status}</Badge>;
}
