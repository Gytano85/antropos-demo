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
import type {
	DetectedObject,
	ObjectDetection,
} from "@tensorflow-models/coco-ssd";
import {
	AlertTriangleIcon,
	CameraIcon,
	CheckCircle2Icon,
	EyeIcon,
	NetworkIcon,
	RefreshCwIcon,
	SaveIcon,
	ShieldAlertIcon,
	UsersIcon,
	VideoOffIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	evaluatePresenceWindow,
	type PresenceSample,
	type PresenceState,
} from "@/lib/cameras/presence-engine";
import { useTRPC } from "@/lib/trpc/client";

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

export default function CamerasPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const ipImageRef = useRef<HTMLImageElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [running, setRunning] = useState(false);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [rawDetectionCount, setRawDetectionCount] = useState(0);
	const [acceptedDetectionCount, setAcceptedDetectionCount] = useState(0);
	const objectDetectorRef = useRef<ObjectDetection | null>(null);
	const objectDetectorPromiseRef = useRef<Promise<ObjectDetection> | null>(
		null,
	);
	const [detectorStatus, setDetectorStatus] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [detection, setDetection] = useState<DetectionResult | null>(null);
	const [stablePresence, setStablePresence] = useState({
		personCount: 0,
		rawPersonCount: 0,
		status: "absent" as PresenceState["status"],
		score: 0,
		positiveSamples: 0,
		totalSamples: 0,
		lastPositiveAt: null as number | null,
		updatedAt: 0,
	});
	const stablePresenceRef = useRef(stablePresence);
	const presenceSamplesRef = useRef<PresenceSample[]>([]);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({
		name: "",
		location: "",
		sourceType: "webcam" as "webcam" | "ip_camera",
		streamUrl: "",
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
			sourceType: selected.sourceType === "ip_camera" ? "ip_camera" : "webcam",
			streamUrl: selected.streamUrl ?? "",
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
				await queryClient.invalidateQueries(
					trpc.cameras.overview.queryOptions(),
				);
				toast.success("Cámara guardada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const recordObservation = useMutation(
		trpc.cameras.recordObservation.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(
					trpc.cameras.overview.queryOptions(),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const getObjectDetector = useCallback(async () => {
		if (objectDetectorRef.current) return objectDetectorRef.current;
		if (!objectDetectorPromiseRef.current) {
			setDetectorStatus("loading");
			objectDetectorPromiseRef.current = (async () => {
				await import("@tensorflow/tfjs");
				const cocoSsd = await import("@tensorflow-models/coco-ssd");
				const detector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
				objectDetectorRef.current = detector;
				setDetectorStatus("ready");
				return detector;
			})().catch((error) => {
				objectDetectorPromiseRef.current = null;
				setDetectorStatus("error");
				throw error;
			});
		}
		return objectDetectorPromiseRef.current;
	}, []);

	const stopCamera = useCallback(() => {
		for (const track of streamRef.current?.getTracks() ?? []) {
			track.stop();
		}
		const overlay = overlayCanvasRef.current;
		overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
		streamRef.current = null;
		setRunning(false);
	}, []);

	const startCamera = async () => {
		if (!selected) return;
		setCameraError(null);
		if (draft.sourceType === "ip_camera") {
			if (!draft.streamUrl.trim()) {
				setCameraError("Agrega la URL HTTP/MJPEG/snapshot de la cámara IP.");
				return;
			}
			setRunning(true);
			void getObjectDetector().catch(() => undefined);
			toast.success("Camara IP activada.");
			return;
		}
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
			void getObjectDetector().catch(() => undefined);
			toast.success("Camara encendida.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "No se pudo abrir la cámara.";
			setCameraError(message);
			recordObservation.mutate({
				cameraId: selected.id,
				personCount: 0,
				confidenceAvg: null,
				status: "camera_error",
			});
		}
	};

	const stabilizePresence = useCallback((sample: PresenceSample) => {
		const now = Date.now();
		presenceSamplesRef.current = [
			...presenceSamplesRef.current.filter((item) => now - item.time <= 15_000),
			sample,
		];
		const next = evaluatePresenceWindow(presenceSamplesRef.current, {
			now,
			windowMs: 15_000,
			holdMs: 4_000,
			minPositiveRatio: 0.62,
			minSamples: 3,
			previous: stablePresenceRef.current,
		});
		stablePresenceRef.current = next;
		setStablePresence(next);
		return next;
	}, []);

	const sampleFromCounts = useCallback(
		({
			personCount,
			confidence,
			source,
		}: {
			personCount: number;
			confidence?: number | null;
			source: PresenceSample["source"];
		}): PresenceSample => ({
			time: Date.now(),
			personCount,
			confidence: personCount > 0 ? (confidence ?? 0.8) : null,
			source: personCount > 0 ? source : "none",
		}),
		[],
	);
	const drawDetections = useCallback(
		(canvas: HTMLCanvasElement, people: DetectedObject[]) => {
			const overlay = overlayCanvasRef.current;
			if (!overlay) return;
			overlay.width = canvas.width;
			overlay.height = canvas.height;
			overlay.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
			const context = overlay.getContext("2d");
			if (!context) return;
			context.clearRect(0, 0, overlay.width, overlay.height);
			context.lineWidth = Math.max(3, Math.round(canvas.width / 320));
			context.font = `${Math.max(16, Math.round(canvas.width / 55))}px sans-serif`;
			for (const person of people) {
				const [x, y, width, height] = person.bbox;
				context.strokeStyle = person.score >= 0.7 ? "#22c55e" : "#f59e0b";
				context.fillStyle = "rgba(0,0,0,0.72)";
				context.strokeRect(x, y, width, height);
				const label = `persona ${Math.round(person.score * 100)}%`;
				const labelWidth = context.measureText(label).width + 12;
				const labelY = Math.max(0, y - 26);
				context.fillRect(x, labelY, labelWidth, 24);
				context.fillStyle = "#fff";
				context.fillText(label, x + 6, labelY + 17);
			}
		},
		[],
	);

	const detectOnce = useCallback(async () => {
		if (!selected || !canvasRef.current || busy) return;
		const isIpCamera = draft.sourceType === "ip_camera";
		const video = videoRef.current;
		const ipImage = ipImageRef.current;
		if (
			!isIpCamera &&
			(!video || video.readyState < 2 || video.videoWidth === 0)
		) {
			return;
		}
		if (isIpCamera && (!ipImage?.complete || ipImage.naturalWidth === 0)) {
			setCameraError(
				"No se pudo leer la imagen de la cámara IP. En navegador normalmente necesitas URL HTTP/MJPEG con CORS o un bridge local.",
			);
			return;
		}

		setBusy(true);
		try {
			const canvas = canvasRef.current;
			canvas.width = isIpCamera
				? (ipImage?.naturalWidth ?? 1280)
				: (video?.videoWidth ?? 1280);
			canvas.height = isIpCamera
				? (ipImage?.naturalHeight ?? 720)
				: (video?.videoHeight ?? 720);
			const context = canvas.getContext("2d");
			if (!context) return;
			context.drawImage(
				isIpCamera
					? (ipImage as HTMLImageElement)
					: (video as HTMLVideoElement),
				0,
				0,
				canvas.width,
				canvas.height,
			);
			try {
				const detector = await getObjectDetector();
				const predictions = await detector.detect(canvas, 20, 0.35);
				const rawPeople = predictions.filter(
					(prediction) => prediction.class === "person",
				);
				const people = predictions.filter((prediction) =>
					isReliablePersonPrediction(prediction, canvas),
				);
				setRawDetectionCount(rawPeople.length);
				setAcceptedDetectionCount(people.length);
				drawDetections(canvas, people);
				const sample = sampleFromCounts({
					personCount: people.length,
					confidence:
						people.length > 0
							? people.reduce((sum, item) => sum + item.score, 0) /
								people.length
							: null,
					source: people.length > 0 ? "model" : "none",
				});
				const stable = stabilizePresence(sample);
				const result: DetectionResult = {
					configured: true,
					personCount: stable.personCount,
					confidenceAvg: stable.personCount > 0 ? stable.score : null,
					message:
						stable.personCount > 1
							? "Se detecto mas de una persona en el puesto."
							: "Deteccion local de personas activa.",
					predictions: people.map((prediction) => ({
						class: prediction.class,
						confidence: prediction.score,
						x: prediction.bbox[0],
						y: prediction.bbox[1],
						width: prediction.bbox[2],
						height: prediction.bbox[3],
					})),
				};
				setDetection(result);
				recordObservation.mutate({
					cameraId: selected.id,
					personCount: stable.personCount,
					confidenceAvg: result.confidenceAvg,
					status:
						stable.personCount > 1
							? "multiple_people"
							: stable.personCount > 0
								? "person_detected"
								: "empty",
				});
				return;
			} catch (error) {
				setCameraError(
					error instanceof Error
						? `Detector local no disponible: ${error.message}`
						: "Detector local no disponible.",
				);
			}

			const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
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
			const sample = sampleFromCounts({
				personCount: rawPersonCount,
				confidence: result.confidenceAvg,
				source: rawPersonCount > 0 ? "model" : "none",
			});
			const stable = stabilizePresence(sample);
			const stabilizedResult = {
				...result,
				personCount: stable.personCount,
				confidenceAvg: stable.personCount > 0 ? stable.score : null,
				message:
					stable.status === "probably_present"
						? "Presencia mantenida por lectura reciente durante maximo 5 segundos."
						: result.message,
			};
			setDetection(stabilizedResult);

			recordObservation.mutate({
				cameraId: selected.id,
				personCount: stable.personCount,
				confidenceAvg: stabilizedResult.confidenceAvg ?? null,
				status:
					!result.configured && stable.personCount === 0
						? "model_not_configured"
						: response.ok && stable.personCount > 1
							? "multiple_people"
							: response.ok && stable.personCount > 0
								? "person_detected"
								: response.ok
									? "empty"
									: "camera_error",
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "No se pudo analizar el frame.";
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
	}, [
		busy,
		drawDetections,
		getObjectDetector,
		draft.sourceType,
		recordObservation,
		sampleFromCounts,
		selected,
		stabilizePresence,
	]);

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

	const openAlerts = (data?.alerts ?? []).filter(
		(alert) => alert.status === "open",
	);

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<CameraIcon className="h-6 w-6 text-primary" />
							<h1 className="font-bold text-2xl">Presencia en puesto</h1>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Modulo de camaras con deteccion local de personas. Cuenta 0, 1 o
							2+ personas desde la webcam o una camara IP compatible.
						</p>
					</div>
					<Badge
						variant={detectorStatus === "error" ? "destructive" : "default"}
					>
						{detectorStatus === "ready"
							? "Detector local listo"
							: detectorStatus === "loading"
								? "Cargando detector"
								: detectorStatus === "error"
									? "Detector local con error"
									: "Detector local"}
					</Badge>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Metric icon={CameraIcon} label="Camaras" value={devices.length} />
				<Metric
					icon={UsersIcon}
					label="Personas ahora"
					value={
						stablePresence.personCount ||
						selected?.lastPersonCount ||
						detection?.personCount ||
						0
					}
				/>
				<Metric
					icon={ShieldAlertIcon}
					label="Alertas abiertas"
					value={openAlerts.length}
				/>
				<Metric
					icon={EyeIcon}
					label="Ultima deteccion"
					value={
						selected?.lastSeenAt
							? new Date(selected.lastSeenAt).toLocaleTimeString()
							: "Sin datos"
					}
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<CameraIcon className="h-5 w-5" />
							{draft.sourceType === "ip_camera"
								? "Camara IP / stream"
								: "Webcam de prueba"}
						</CardTitle>
						<CardDescription>
							La webcam sirve para demo. Para camara IP usa una URL HTTP/MJPEG o
							snapshot accesible desde la misma red.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative overflow-hidden rounded-2xl border bg-black">
							{draft.sourceType === "ip_camera" ? (
								<img
									ref={ipImageRef}
									src={running ? draft.streamUrl : undefined}
									alt="Vista de camara IP"
									crossOrigin="anonymous"
									className="aspect-video w-full object-cover"
								/>
							) : (
								<video
									ref={videoRef}
									className="aspect-video w-full object-cover"
									muted
									playsInline
								/>
							)}
							<canvas
								ref={overlayCanvasRef}
								className="pointer-events-none absolute inset-0 h-full w-full"
							/>
						</div>
						<canvas ref={canvasRef} className="hidden" />
						<div className="flex flex-wrap items-center gap-2">
							<Button onClick={startCamera} disabled={running || !selected}>
								{draft.sourceType === "ip_camera" ? (
									<NetworkIcon className="mr-2 h-4 w-4" />
								) : (
									<CameraIcon className="mr-2 h-4 w-4" />
								)}
								{draft.sourceType === "ip_camera"
									? "Conectar camara IP"
									: "Encender webcam"}
							</Button>
							<Button
								variant="outline"
								onClick={stopCamera}
								disabled={!running}
							>
								<VideoOffIcon className="mr-2 h-4 w-4" />
								Apagar
							</Button>
							<Button
								variant="outline"
								onClick={detectOnce}
								disabled={!running || busy}
							>
								<RefreshCwIcon className="mr-2 h-4 w-4" />
								Analizar ahora
							</Button>
						</div>
						<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
								<div>
									<div className="font-semibold text-base">
										Detector de personas
									</div>
									<div className="mt-1 text-muted-foreground text-xs">
										Modelo local COCO-SSD. Solo cuenta detecciones de clase
										persona; los recuadros se dibujan encima del video.
									</div>
								</div>
								<div className="grid grid-cols-3 gap-2 text-center text-xs">
									<div className="rounded-lg bg-background px-3 py-2">
										<div className="font-bold text-base">
											{rawDetectionCount}
										</div>
										<div className="text-muted-foreground">detectadas</div>
									</div>
									<div className="rounded-lg bg-background px-3 py-2">
										<div className="font-bold text-base">
											{acceptedDetectionCount}
										</div>
										<div className="text-muted-foreground">filtradas</div>
									</div>
									<div className="rounded-lg bg-background px-3 py-2">
										<div className="font-bold text-base">
											{stablePresence.personCount}
										</div>
										<div className="text-muted-foreground">estables</div>
									</div>
								</div>
							</div>
						</div>
						{cameraError && (
							<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
								{cameraError}
							</div>
						)}
						<DetectionStatus
							result={detection}
							busy={busy}
							detectorStatus={detectorStatus}
							stablePresence={stablePresence}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Configuración</CardTitle>
						<CardDescription>
							Configura la fuente de video y el tiempo permitido sin presencia.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Cámara</Label>
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
										<div className="text-muted-foreground text-xs">
											{device.location}
										</div>
									</button>
								))}
							</div>
						</div>
						<div className="grid gap-3">
							<LabeledInput
								label="Nombre"
								value={draft.name}
								onChange={(value) =>
									setDraft((current) => ({ ...current, name: value }))
								}
							/>
							<LabeledInput
								label="Ubicación"
								value={draft.location}
								onChange={(value) =>
									setDraft((current) => ({ ...current, location: value }))
								}
							/>
							<div className="grid gap-2">
								<Label>Tipo de cámara</Label>
								<div className="grid grid-cols-2 gap-2">
									<Button
										type="button"
										variant={
											draft.sourceType === "webcam" ? "default" : "outline"
										}
										onClick={() =>
											setDraft((current) => ({
												...current,
												sourceType: "webcam",
											}))
										}
									>
										Webcam prueba
									</Button>
									<Button
										type="button"
										variant={
											draft.sourceType === "ip_camera" ? "default" : "outline"
										}
										onClick={() =>
											setDraft((current) => ({
												...current,
												sourceType: "ip_camera",
											}))
										}
									>
										Cámara IP
									</Button>
								</div>
							</div>
							{draft.sourceType === "ip_camera" ? (
								<div className="space-y-2">
									<LabeledInput
										label="URL HTTP/MJPEG/snapshot"
										value={draft.streamUrl}
										placeholder="http://192.168.1.50/video o /snapshot.jpg"
										onChange={(value) =>
											setDraft((current) => ({
												...current,
												streamUrl: value,
											}))
										}
									/>
									<div className="rounded-xl border bg-muted/40 p-3 text-muted-foreground text-xs">
										RTSP no corre directo en navegador. Para RTSP se necesita un
										bridge local que convierta a HTTP/MJPEG/WebRTC. En Vercel,
										una IP privada 192.168.x.x no es accesible desde el
										servidor; debe correr un agente en la misma red.
									</div>
								</div>
							) : null}
							<div className="grid grid-cols-2 gap-3">
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
								label="Alerta sin presencia en segundos"
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
										streamUrl:
											draft.sourceType === "ip_camera" ? draft.streamUrl : null,
									})
								}
								disabled={saveCamera.isPending}
							>
								<SaveIcon className="mr-2 h-4 w-4" />
								Guardar configuración
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
							Aquí queda el rastro cuando el puesto queda sin presencia o la
							cámara falla.
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
											<Badge
												variant={
													alert.status === "open" ? "destructive" : "outline"
												}
											>
												{alert.status === "open" ? "Abierta" : "Resuelta"}
											</Badge>
										</TableCell>
										<TableCell className="max-w-[360px]">
											{alert.message}
										</TableCell>
										<TableCell>
											{alert.startedAt
												? new Date(alert.startedAt).toLocaleString()
												: "-"}
										</TableCell>
									</TableRow>
								))}
								{!isLoading && (data?.alerts ?? []).length === 0 && (
									<TableRow>
										<TableCell
											colSpan={3}
											className="text-center text-muted-foreground"
										>
											Sin alertas todavía.
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
							Muestras guardadas para comprobar que el módulo está trabajando.
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
											{event.createdAt
												? new Date(event.createdAt).toLocaleTimeString()
												: "-"}
										</TableCell>
										<TableCell>{event.personCount}</TableCell>
										<TableCell>
											{event.confidenceAvg
												? `${Math.round(event.confidenceAvg * 100)}%`
												: "-"}
										</TableCell>
										<TableCell>{readableStatus(event.status)}</TableCell>
									</TableRow>
								))}
								{!isLoading && (data?.events ?? []).length === 0 && (
									<TableRow>
										<TableCell
											colSpan={4}
											className="text-center text-muted-foreground"
										>
											Enciende la cámara para empezar a registrar lecturas.
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
			<Input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				{...props}
			/>
		</div>
	);
}

function DetectionStatus({
	result,
	busy,
	detectorStatus,
	stablePresence,
}: {
	result: DetectionResult | null;
	busy: boolean;
	detectorStatus: "idle" | "loading" | "ready" | "error";
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

	if (detectorStatus === "loading") {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
				<RefreshCwIcon className="mt-0.5 h-4 w-4 animate-spin" />
				<div>
					<div className="font-medium">Cargando detector local</div>
					<div>
						La primera lectura tarda mas porque descarga el modelo de personas.
					</div>
				</div>
			</div>
		);
	}

	if (!result) {
		return (
			<div className="rounded-xl border bg-muted p-3 text-muted-foreground text-sm">
				Aun no hay lectura. Enciende la camara y espera a que el detector local
				termine de cargar.
			</div>
		);
	}

	if (result.error) {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
				<AlertTriangleIcon className="mt-0.5 h-4 w-4" />
				<div>
					<div className="font-medium">Error de detección</div>
					<div>{result.error}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-xl border bg-muted p-3 text-sm">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{result.personCount > 1 ? (
						<AlertTriangleIcon className="h-4 w-4 text-destructive" />
					) : result.personCount > 0 ? (
						<CheckCircle2Icon className="h-4 w-4 text-emerald-600" />
					) : (
						<AlertTriangleIcon className="h-4 w-4 text-amber-600" />
					)}
					<span>
						{result.personCount > 1
							? `Alerta: ${result.personCount} personas detectadas`
							: result.personCount > 0
								? `Detectadas ${result.personCount} persona(s)`
								: "No se detectaron personas en este frame"}
					</span>
				</div>
				<span className="text-muted-foreground">
					{result.confidenceAvg
						? `${Math.round(result.confidenceAvg * 100)}%`
						: "-"}
				</span>
			</div>
			{result.message && (
				<div className="mt-1 text-muted-foreground text-xs">
					{result.message}
				</div>
			)}
			<div className="mt-2 grid gap-2 text-muted-foreground text-xs sm:grid-cols-3">
				<div>Frame actual: {stablePresence.rawPersonCount}</div>
				<div>Lectura usada: {stablePresence.personCount}</div>
				<div>
					Último positivo:{" "}
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
		multiple_people: "Mas de una persona",
		empty: "Sin personas",
		presence_error: "Sin presencia",
		camera_error: "Error de cámara",
		model_not_configured: "Sin modelo",
	};
	return labels[status] ?? status;
}

function isReliablePersonPrediction(
	prediction: DetectedObject,
	canvas: HTMLCanvasElement,
) {
	if (prediction.class !== "person") return false;
	if (prediction.score < 0.42) return false;
	const [, , width, height] = prediction.bbox;
	const areaRatio =
		(width * height) / Math.max(1, canvas.width * canvas.height);
	const heightRatio = height / Math.max(1, canvas.height);
	return areaRatio >= 0.015 && heightRatio >= 0.14;
}
