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
	CameraIcon,
	CheckCircle2Icon,
	EyeIcon,
	RefreshCwIcon,
	SaveIcon,
	ShieldAlertIcon,
	UsersIcon,
	VideoOffIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type CameraDevice = {
	id: number;
	name: string;
	location: string;
	modelId: string;
	confidenceThreshold: number;
	checkIntervalSeconds: number;
	noPersonTimeoutSeconds: number;
	status: string;
	lastSeenAt: string | null;
	lastCheckedAt: string | null;
	lastPersonCount: number;
};

type DetectionResult = {
	configured: boolean;
	personCount: number;
	confidenceAvg: number | null;
	message?: string;
	error?: string;
	predictions?: Array<{
		class?: string;
		confidence?: number;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
	}>;
};

type BrowserFaceDetector = new (options?: {
	fastMode?: boolean;
	maxDetectedFaces?: number;
}) => {
	detect: (image: CanvasImageSource) => Promise<Array<unknown>>;
};

declare global {
	interface Window {
		FaceDetector?: BrowserFaceDetector;
	}
}

export default function CamerasPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [running, setRunning] = useState(false);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [detection, setDetection] = useState<DetectionResult | null>(null);
	const [stablePresence, setStablePresence] = useState({
		personCount: 0,
		rawPersonCount: 0,
		lastPositiveAt: null as number | null,
		updatedAt: null as number | null,
	});
	const stablePresenceRef = useRef(stablePresence);
	const presenceSamplesRef = useRef<Array<{ count: number; time: number }>>([]);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({
		name: "",
		location: "",
		modelId: "security-camera-with-person/1",
		confidenceThreshold: 0.12,
		checkIntervalSeconds: 3,
		noPersonTimeoutSeconds: 180,
		status: "active" as "active" | "inactive",
	});

	const { data, isLoading } = useQuery(trpc.cameras.overview.queryOptions());
	const devices = data?.devices ?? [];
	const selected = useMemo(
		() => devices.find((device) => device.id === selectedId) ?? devices[0],
		[devices, selectedId],
	);

	useEffect(() => {
		if (!selected && devices[0]) {
			setSelectedId(devices[0].id);
		}
	}, [devices, selected]);

	useEffect(() => {
		if (!selected) return;
		setDraft({
			name: selected.name,
			location: selected.location,
			modelId: selected.modelId,
			confidenceThreshold: selected.confidenceThreshold,
			checkIntervalSeconds: selected.checkIntervalSeconds,
			noPersonTimeoutSeconds: selected.noPersonTimeoutSeconds,
			status: selected.status === "inactive" ? "inactive" : "active",
		});
	}, [selected]);

	const saveCamera = useMutation(
		trpc.cameras.saveCamera.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.cameras.overview.queryOptions());
				toast.success("Camara guardada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const recordObservation = useMutation(
		trpc.cameras.recordObservation.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.cameras.overview.queryOptions());
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const stopCamera = useCallback(() => {
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		setRunning(false);
	}, []);

	const startCamera = async () => {
		if (!selected) return;
		setCameraError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					facingMode: "user",
				},
				audio: false,
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}
			setRunning(true);
			toast.success("Camara encendida.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "No se pudo abrir la camara.";
			setCameraError(message);
			recordObservation.mutate({
				cameraId: selected.id,
				personCount: 0,
				confidenceAvg: null,
				status: "camera_error",
			});
		}
	};

	const stabilizePresence = useCallback((rawPersonCount: number) => {
		const now = Date.now();
		const holdMs = 5_000;
		const current = stablePresenceRef.current;
		presenceSamplesRef.current = [
			...presenceSamplesRef.current.filter((sample) => now - sample.time <= holdMs),
			{ count: rawPersonCount, time: now },
		];
		const positiveSamples = presenceSamplesRef.current.filter(
			(sample) => sample.count > 0,
		);
		const lastPositiveAt = rawPersonCount > 0 ? now : current.lastPositiveAt;
		const positiveMode = getConservativeMode(
			positiveSamples.map((sample) => sample.count),
		);
		const personCount =
			positiveMode > 0
				? positiveMode
				: lastPositiveAt !== null && now - lastPositiveAt <= holdMs
					? current.personCount
					: 0;
		const next = {
			personCount,
			rawPersonCount,
			lastPositiveAt,
			updatedAt: now,
		};
		stablePresenceRef.current = next;
		setStablePresence(next);
		return next;
	}, []);

	const detectOnce = useCallback(async () => {
		if (!selected || !videoRef.current || !canvasRef.current || busy) return;
		const video = videoRef.current;
		if (video.readyState < 2 || video.videoWidth === 0) return;

		setBusy(true);
		try {
			const canvas = canvasRef.current;
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const context = canvas.getContext("2d");
			if (!context) return;
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);

			if (window.FaceDetector) {
				const detector = new window.FaceDetector({
					fastMode: true,
					maxDetectedFaces: 20,
				});
				const faces = await detector.detect(canvas);
				const stable = stabilizePresence(faces.length);
				const result: DetectionResult = {
					configured: true,
					personCount: stable.personCount,
					confidenceAvg: faces.length > 0 ? 0.8 : null,
					message:
						"Deteccion local por rostro con suavizado de 5 segundos para webcam frontal.",
					predictions: [],
				};
				setDetection(result);
				recordObservation.mutate({
					cameraId: selected.id,
					personCount: stable.personCount,
					confidenceAvg: result.confidenceAvg,
					status: stable.personCount > 0 ? "person_detected" : "empty",
				});
				return;
			}

			const response = await fetch("/api/cameras/detect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					imageDataUrl,
					modelId: selected.modelId,
					confidenceThreshold: selected.confidenceThreshold,
				}),
			});
			const result = (await response.json()) as DetectionResult;
			const rawPersonCount = result.personCount ?? 0;
			const stable = stabilizePresence(rawPersonCount);
			const stabilizedResult = {
				...result,
				personCount: stable.personCount,
				message:
					stable.personCount > 0 && rawPersonCount === 0
						? "Presencia mantenida por lectura reciente durante maximo 5 segundos."
						: result.message,
			};
			setDetection(stabilizedResult);

			recordObservation.mutate({
				cameraId: selected.id,
				personCount: stable.personCount,
				confidenceAvg: result.confidenceAvg ?? null,
				status: !result.configured
					? "model_not_configured"
					: response.ok && stable.personCount > 0
						? "person_detected"
						: response.ok
							? "empty"
							: "camera_error",
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "No se pudo analizar el frame.";
			setDetection({
				configured: true,
				personCount: 0,
				confidenceAvg: null,
				error: message,
			});
			recordObservation.mutate({
				cameraId: selected.id,
				personCount: 0,
				confidenceAvg: null,
				status: "camera_error",
			});
		} finally {
			setBusy(false);
		}
	}, [busy, data?.inferenceConfigured, recordObservation, selected, stabilizePresence]);

	useEffect(() => {
		if (!running || !selected) return;
		let cancelled = false;
		let timeout: ReturnType<typeof setTimeout>;

		const loop = async () => {
			if (cancelled) return;
			await detectOnce();
			timeout = setTimeout(loop, selected.checkIntervalSeconds * 1000);
		};

		timeout = setTimeout(loop, 700);
		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [detectOnce, running, selected]);

	useEffect(() => () => stopCamera(), [stopCamera]);

	const openAlerts = (data?.alerts ?? []).filter((alert) => alert.status === "open");

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<CameraIcon className="h-6 w-6 text-primary" />
							<h1 className="font-bold text-2xl">Camara de presencia</h1>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Conecta una webcam, cuenta personas y abre alerta si pasan 3 minutos sin presencia.
						</p>
					</div>
					<Badge variant={data?.inferenceConfigured ? "default" : "destructive"}>
						{data?.inferenceConfigured ? "Roboflow configurado" : "Falta ROBOFLOW_API_KEY"}
					</Badge>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Metric icon={CameraIcon} label="Camaras" value={devices.length} />
				<Metric
					icon={UsersIcon}
					label="Personas ahora"
					value={stablePresence.personCount || selected?.lastPersonCount || detection?.personCount || 0}
				/>
				<Metric icon={ShieldAlertIcon} label="Alertas abiertas" value={openAlerts.length} />
				<Metric
					icon={EyeIcon}
					label="Ultima deteccion"
					value={selected?.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleTimeString() : "Sin datos"}
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<CameraIcon className="h-5 w-5" />
							Webcam en vivo
						</CardTitle>
						<CardDescription>
							Para presentarlo: conecta tu webcam, acepta permisos del navegador y deja que corra la lectura.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="overflow-hidden rounded-2xl border bg-black">
							<video
								ref={videoRef}
								className="aspect-video w-full object-cover"
								muted
								playsInline
							/>
						</div>
						<canvas ref={canvasRef} className="hidden" />
						<div className="flex flex-wrap items-center gap-2">
							<Button onClick={startCamera} disabled={running || !selected}>
								<CameraIcon className="mr-2 h-4 w-4" />
								Encender webcam
							</Button>
							<Button variant="outline" onClick={stopCamera} disabled={!running}>
								<VideoOffIcon className="mr-2 h-4 w-4" />
								Apagar
							</Button>
							<Button variant="outline" onClick={detectOnce} disabled={!running || busy}>
								<RefreshCwIcon className="mr-2 h-4 w-4" />
								Analizar ahora
							</Button>
						</div>
						{cameraError && (
							<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
								{cameraError}
							</div>
						)}
						<DetectionStatus
							result={detection}
							busy={busy}
							inferenceConfigured={Boolean(data?.inferenceConfigured)}
							stablePresence={stablePresence}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Configuracion</CardTitle>
						<CardDescription>
							La regla principal es el tiempo permitido sin detectar personas.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Camara</Label>
							<div className="grid gap-2">
								{devices.map((device) => (
									<button
										type="button"
										key={device.id}
										onClick={() => setSelectedId(device.id)}
										className={`rounded-xl border p-3 text-left transition ${
											selected?.id === device.id
												? "border-primary bg-primary/5"
												: "hover:bg-muted"
										}`}
									>
										<div className="font-medium">{device.name}</div>
										<div className="text-muted-foreground text-xs">{device.location}</div>
									</button>
								))}
							</div>
						</div>
						<div className="grid gap-3">
							<LabeledInput
								label="Nombre"
								value={draft.name}
								onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
							/>
							<LabeledInput
								label="Ubicacion"
								value={draft.location}
								onChange={(value) => setDraft((current) => ({ ...current, location: value }))}
							/>
							<LabeledInput
								label="Modelo Roboflow"
								value={draft.modelId}
								onChange={(value) => setDraft((current) => ({ ...current, modelId: value }))}
							/>
							<div className="grid grid-cols-2 gap-3">
								<LabeledInput
									label="Confianza"
									type="number"
									step="0.01"
									min="0.05"
									max="0.95"
									value={String(draft.confidenceThreshold)}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											confidenceThreshold: Number(value),
										}))
									}
								/>
								<LabeledInput
									label="Intervalo seg."
									type="number"
									min="3"
									value={String(draft.checkIntervalSeconds)}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											checkIntervalSeconds: Number(value),
										}))
									}
								/>
							</div>
							<LabeledInput
								label="Alerta sin personas seg."
								type="number"
								min="30"
								value={String(draft.noPersonTimeoutSeconds)}
								onChange={(value) =>
									setDraft((current) => ({
										...current,
										noPersonTimeoutSeconds: Number(value),
									}))
								}
							/>
							<Button
								onClick={() =>
									saveCamera.mutate({
										id: selected?.id,
										...draft,
									})
								}
								disabled={saveCamera.isPending}
							>
								<SaveIcon className="mr-2 h-4 w-4" />
								Guardar configuracion
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Alertas</CardTitle>
						<CardDescription>
							Aqui queda el rastro cuando la camara deja de ver personas, falla o no tiene modelo.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Estado</TableHead>
									<TableHead>Mensaje</TableHead>
									<TableHead>Inicio</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data?.alerts ?? []).map((alert) => (
									<TableRow key={alert.id}>
										<TableCell>
											<Badge variant={alert.status === "open" ? "destructive" : "outline"}>
												{alert.status === "open" ? "Abierta" : "Resuelta"}
											</Badge>
										</TableCell>
										<TableCell className="max-w-[360px]">{alert.message}</TableCell>
										<TableCell>
											{alert.startedAt ? new Date(alert.startedAt).toLocaleString() : "-"}
										</TableCell>
									</TableRow>
								))}
								{!isLoading && (data?.alerts ?? []).length === 0 && (
									<TableRow>
										<TableCell colSpan={3} className="text-center text-muted-foreground">
											Sin alertas todavia.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Lecturas recientes</CardTitle>
						<CardDescription>
							Muestras guardadas por la webcam para comprobar que el modulo esta trabajando.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Hora</TableHead>
									<TableHead>Personas</TableHead>
									<TableHead>Confianza</TableHead>
									<TableHead>Estado</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data?.events ?? []).slice(0, 12).map((event) => (
									<TableRow key={event.id}>
										<TableCell>
											{event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : "-"}
										</TableCell>
										<TableCell>{event.personCount}</TableCell>
										<TableCell>
											{event.confidenceAvg ? `${Math.round(event.confidenceAvg * 100)}%` : "-"}
										</TableCell>
										<TableCell>{readableStatus(event.status)}</TableCell>
									</TableRow>
								))}
								{!isLoading && (data?.events ?? []).length === 0 && (
									<TableRow>
										<TableCell colSpan={4} className="text-center text-muted-foreground">
											Enciende la webcam para empezar a registrar lecturas.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>
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

function LabeledInput({
	label,
	value,
	onChange,
	...props
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input value={value} onChange={(event) => onChange(event.target.value)} {...props} />
		</div>
	);
}

function DetectionStatus({
	result,
	busy,
	inferenceConfigured,
	stablePresence,
}: {
	result: DetectionResult | null;
	busy: boolean;
	inferenceConfigured: boolean;
	stablePresence: {
		personCount: number;
		rawPersonCount: number;
		lastPositiveAt: number | null;
		updatedAt: number | null;
	};
}) {
	if (busy) {
		return (
			<div className="flex items-center gap-2 rounded-xl border bg-muted p-3 text-sm">
				<RefreshCwIcon className="h-4 w-4 animate-spin" />
				Analizando frame...
			</div>
		);
	}

	const hasLocalFaceDetector =
		typeof window !== "undefined" && Boolean(window.FaceDetector);

	if ((!inferenceConfigured && !hasLocalFaceDetector) || result?.configured === false) {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
				<AlertTriangleIcon className="mt-0.5 h-4 w-4" />
				<div>
					<div className="font-medium">Modelo no configurado</div>
					<div>Agrega ROBOFLOW_API_KEY para activar deteccion real de personas.</div>
				</div>
			</div>
		);
	}

	if (!result) {
		return (
			<div className="rounded-xl border bg-muted p-3 text-muted-foreground text-sm">
				Aun no hay lectura. Enciende la webcam o analiza manualmente.
			</div>
		);
	}

	if (result.error) {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
				<AlertTriangleIcon className="mt-0.5 h-4 w-4" />
				<div>
					<div className="font-medium">Error de deteccion</div>
					<div>{result.error}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-xl border bg-muted p-3 text-sm">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{result.personCount > 0 ? (
						<CheckCircle2Icon className="h-4 w-4 text-emerald-600" />
					) : (
						<AlertTriangleIcon className="h-4 w-4 text-amber-600" />
					)}
					<span>
						{result.personCount > 0
							? `Detectadas ${result.personCount} persona(s)`
							: "No se detectaron personas en este frame"}
					</span>
				</div>
				<span className="text-muted-foreground">
					{result.confidenceAvg ? `${Math.round(result.confidenceAvg * 100)}%` : "-"}
				</span>
			</div>
			{result.message && (
				<div className="mt-1 text-muted-foreground text-xs">{result.message}</div>
			)}
			<div className="mt-2 grid gap-2 text-muted-foreground text-xs sm:grid-cols-3">
				<div>Frame actual: {stablePresence.rawPersonCount}</div>
				<div>Lectura usada: {stablePresence.personCount}</div>
				<div>
					Ultimo positivo:{" "}
					{stablePresence.lastPositiveAt
						? new Date(stablePresence.lastPositiveAt).toLocaleTimeString()
						: "-"}
				</div>
			</div>
		</div>
	);
}

function readableStatus(status: string) {
	const labels: Record<string, string> = {
		person_detected: "Persona detectada",
		empty: "Sin personas",
		presence_error: "Sin presencia",
		camera_error: "Error camara",
		model_not_configured: "Sin modelo",
	};
	return labels[status] ?? status;
}

function getConservativeMode(values: number[]) {
	if (values.length === 0) return 0;
	const counts = new Map<number, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	let bestValue = values[0] ?? 0;
	let bestCount = 0;
	for (const [value, count] of counts) {
		if (count > bestCount || (count === bestCount && value < bestValue)) {
			bestValue = value;
			bestCount = count;
		}
	}
	return bestValue;
}
