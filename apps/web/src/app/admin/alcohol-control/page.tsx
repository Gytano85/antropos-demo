"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
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
	BeerIcon,
	CheckCircle2Icon,
	ScaleIcon,
	ShieldAlertIcon,
} from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type BottleStatus = "ok" | "review" | "critical";

type SerialPort = {
	open: (options: { baudRate: number }) => Promise<void>;
	readable?: ReadableStream<Uint8Array>;
};

declare global {
	interface Navigator {
		serial: {
			requestPort: () => Promise<SerialPort>;
		};
	}
}

export default function AlcoholControlPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(
		trpc.alcoholControl.overview.queryOptions(),
	);
	const bottles = data?.bottles ?? [];
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const serialPortRef = useRef<SerialPort | null>(null);
	const [usbStatus, setUsbStatus] = useState("Sin conectar");
	const selected = useMemo(
		() => bottles.find((bottle) => bottle.id === selectedId) ?? bottles[0],
		[bottles, selectedId],
	);
	const [weightDraft, setWeightDraft] = useState("");

	const recordReading = useMutation(
		trpc.alcoholControl.recordReading.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(
					trpc.alcoholControl.overview.queryOptions(),
				);
				toast.success("Lectura registrada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const currentWeight =
		weightDraft ||
		(selected?.currentWeightG
			? String(Math.round(selected.currentWeightG))
			: "");

	return (
		<div className="space-y-6">
			<section className="rounded-3xl border bg-card p-6">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<ScaleIcon className="h-7 w-7 text-primary" />
							<h1 className="font-bold text-3xl">Control de alcohol</h1>
						</div>
						<p className="mt-2 max-w-3xl text-muted-foreground">
							Básculas por botella: compara consumo físico contra ventas,
							recetas y tolerancia configurada. No intenta adivinar con cámara.
						</p>
					</div>
					<Badge variant="outline">demo con lecturas manuales</Badge>
				</div>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Conexion real de bascula</CardTitle>
					<CardDescription>
						Una bascula puede conectarse por USB directo al navegador con Web
						Serial o por HTTP desde ESP32/Raspberry. La captura manual solo es
						para demo.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-3">
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">Endpoint</div>
						<code className="mt-2 block break-all text-sm">
							POST /api/alcohol-control/scale-readings
						</code>
					</div>
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">Header</div>
						<code className="mt-2 block break-all text-sm">
							x-scale-token: dev-scale-token
						</code>
					</div>
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">USB</div>
						<code className="mt-2 block break-all text-sm">
							Web Serial: envia lineas tipo 1062.5
						</code>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-4">
				<Metric
					icon={BeerIcon}
					label="Botellas"
					value={data?.summary.totalBottles ?? 0}
				/>
				<Metric
					icon={ShieldAlertIcon}
					label="En revisión"
					value={data?.summary.reviewCount ?? 0}
				/>
				<Metric
					icon={AlertTriangleIcon}
					label="Críticas"
					value={data?.summary.criticalCount ?? 0}
				/>
				<Metric
					icon={ScaleIcon}
					label="Diferencia total"
					value={`${data?.summary.totalDifferenceMl ?? 0} ml`}
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
				<Card>
					<CardHeader>
						<CardTitle>Botellas en báscula</CardTitle>
						<CardDescription>
							La lectura física se compara con el consumo esperado por POS.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Botella</TableHead>
									<TableHead>Restante</TableHead>
									<TableHead>Físico</TableHead>
									<TableHead>Esperado</TableHead>
									<TableHead>Diferencia</TableHead>
									<TableHead>Estado</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{bottles.map((bottle) => (
									<TableRow
										key={bottle.id}
										className="cursor-pointer"
										onClick={() => {
											setSelectedId(bottle.id);
											setWeightDraft(
												bottle.currentWeightG
													? String(Math.round(bottle.currentWeightG))
													: "",
											);
										}}
									>
										<TableCell>
											<div className="font-medium">{bottle.name}</div>
											<div className="text-muted-foreground text-xs">
												{bottle.fullVolumeMl} ml · tolerancia{" "}
												{bottle.toleranceMl} ml
											</div>
											<div className="text-muted-foreground text-xs">
												Key: {bottle.scaleKey ?? `bottle-${bottle.id}`}
											</div>
										</TableCell>
										<TableCell>
											<div className="font-semibold">
												{bottle.evaluation.currentVolumeMl} ml
											</div>
											<div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-primary"
													style={{
														width: `${bottle.evaluation.remainingPct}%`,
													}}
												/>
											</div>
										</TableCell>
										<TableCell>
											{bottle.evaluation.physicalUsedMl} ml usados
										</TableCell>
										<TableCell>
											{bottle.evaluation.expectedUsedMl} ml vendidos
										</TableCell>
										<TableCell
											className={
												Math.abs(bottle.evaluation.differenceMl) >
												bottle.toleranceMl
													? "font-semibold text-destructive"
													: ""
											}
										>
											{bottle.evaluation.differenceMl > 0 ? "+" : ""}
											{bottle.evaluation.differenceMl} ml
										</TableCell>
										<TableCell>
											<StatusBadge status={bottle.evaluation.status} />
										</TableCell>
									</TableRow>
								))}
								{!isLoading && bottles.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center text-muted-foreground"
										>
											Sin botellas configuradas.
										</TableCell>
									</TableRow>
								) : null}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Registrar lectura</CardTitle>
						<CardDescription>
							Para demo: escribe el peso bruto que enviaría la báscula.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{selected ? (
							<>
								<div className="rounded-2xl border bg-muted/40 p-4">
									<div className="text-muted-foreground text-sm">Botella</div>
									<div className="font-semibold text-lg">{selected.name}</div>
									<div className="mt-2 text-muted-foreground text-sm">
										Tara {selected.emptyWeightG} g · llena{" "}
										{selected.fullVolumeMl} ml
									</div>
									<div className="mt-1 text-muted-foreground text-xs">
										scaleKey: {selected.scaleKey ?? `bottle-${selected.id}`}
									</div>
								</div>
								<div className="space-y-2">
									<Label>Peso bruto actual en gramos</Label>
									<Input
										type="number"
										value={currentWeight}
										onChange={(event) => setWeightDraft(event.target.value)}
									/>
								</div>
								<Button
									className="w-full"
									disabled={recordReading.isPending || !currentWeight}
									onClick={() =>
										recordReading.mutate({
											bottleId: selected.id,
											weightG: Number(currentWeight),
										})
									}
								>
									<ScaleIcon className="mr-2 h-4 w-4" />
									Guardar lectura
								</Button>
								<Button
									type="button"
									variant="outline"
									className="w-full"
									onClick={async () => {
										if (!selected) return;
										if (!("serial" in navigator)) {
											toast.error("Este navegador no soporta Web Serial.");
											return;
										}
										try {
											const port = await navigator.serial.requestPort();
											await port.open({ baudRate: 9600 });
											serialPortRef.current = port;
											setUsbStatus("USB conectado. Esperando peso...");
											const reader = port.readable
												?.pipeThrough(new TextDecoderStream())
												.getReader();
											if (!reader) throw new Error("No se pudo leer USB.");

											let buffer = "";
											while (serialPortRef.current === port) {
												const { value, done } = await reader.read();
												if (done) break;
												buffer += value;
												const lines = buffer.split(/\r?\n/);
												buffer = lines.pop() ?? "";
												for (const line of lines) {
													const match = line.match(/-?\d+(\.\d+)?/);
													if (!match) continue;
													const weightG = Number(match[0]);
													setWeightDraft(String(weightG));
													recordReading.mutate({
														bottleId: selected.id,
														weightG,
													});
													setUsbStatus(`Ultimo peso USB: ${weightG} g`);
													return;
												}
											}
										} catch (error) {
											setUsbStatus("USB desconectado/error.");
											toast.error(
												error instanceof Error
													? error.message
													: "No se pudo leer la bascula USB.",
											);
										}
									}}
								>
									Conectar bascula USB
								</Button>
								<div className="rounded-xl border bg-muted/40 p-3 text-muted-foreground text-xs">
									{usbStatus}
								</div>
								<div className="rounded-2xl border p-4 text-sm">
									<div className="font-medium">Cómo se calcula</div>
									<div className="mt-1 text-muted-foreground">
										Volumen restante = (peso actual - tara) / densidad. Luego
										compara lo usado contra lo que debería haberse usado por
										recetas/ventas.
									</div>
								</div>
							</>
						) : (
							<div className="text-muted-foreground text-sm">
								Selecciona una botella.
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Lecturas recientes</CardTitle>
					<CardDescription>
						Historial de pesos enviados por báscula o capturados manualmente.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Hora</TableHead>
								<TableHead>Botella</TableHead>
								<TableHead>Peso</TableHead>
								<TableHead>Físico</TableHead>
								<TableHead>Diferencia</TableHead>
								<TableHead>Estado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data?.readings ?? []).map((reading) => {
								const bottle = bottles.find(
									(item) => item.id === reading.bottleId,
								);
								return (
									<TableRow key={reading.id}>
										<TableCell>
											{reading.createdAt
												? new Date(reading.createdAt).toLocaleTimeString()
												: "-"}
										</TableCell>
										<TableCell>{bottle?.name ?? reading.bottleId}</TableCell>
										<TableCell>{reading.weightG} g</TableCell>
										<TableCell>{reading.physicalUsedMl} ml usados</TableCell>
										<TableCell>
											{reading.differenceMl > 0 ? "+" : ""}
											{reading.differenceMl} ml
										</TableCell>
										<TableCell>
											<StatusBadge status={reading.status} />
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({
	icon: Icon,
	label,
	value,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-3 p-4">
				<div className="rounded-xl bg-primary/10 p-2 text-primary">
					<Icon className="h-5 w-5" />
				</div>
				<div>
					<div className="font-semibold text-xl">{value}</div>
					<div className="text-muted-foreground text-xs">{label}</div>
				</div>
			</CardContent>
		</Card>
	);
}

function StatusBadge({ status }: { status: BottleStatus }) {
	if (status === "ok") {
		return (
			<Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
				<CheckCircle2Icon className="h-3 w-3" />
				Cuadra
			</Badge>
		);
	}
	if (status === "critical") {
		return (
			<Badge variant="destructive" className="gap-1">
				<AlertTriangleIcon className="h-3 w-3" />
				Crítico
			</Badge>
		);
	}
	return (
		<Badge variant="secondary" className="gap-1">
			<ShieldAlertIcon className="h-3 w-3" />
			Revisar
		</Badge>
	);
}
