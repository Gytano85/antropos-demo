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
	ChevronRightIcon,
	EyeIcon,
	NetworkIcon,
	PackageIcon,
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
	BAR_MODEL_ID,
	BAR_MODEL_LABELS,
	type BarModelDetection,
	candidatesFromCocoDetections,
	candidatesFromOwlDetections,
} from "@/lib/cameras/bar-service-detector";
import {
	type BarExitEvent,
	type BarItemType,
	type BarTrack,
	type BoundingBox,
	type CountingDirection,
	type CountingLine,
	defaultCountingLine,
	itemLabel,
	normalizeLine,
	placeCountingGate,
	trackingRegion,
	updateBarTracks,
} from "@/lib/cameras/bar-service-tracker";
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

type CameraMode = "presence" | "bar_exit";
type BarModelStatus = "idle" | "loading" | "ready" | "unsupported" | "error";
type BarModelRuntime = "webgpu" | "wasm" | "coco";
type BarModelDetector = (
	image: string,
	candidateLabels: string[],
	options: { threshold: number; top_k: number },
) => Promise<BarModelDetection[]>;
type TransformersPipeline = (
	task: string,
	model: string,
	options: Record<string, unknown>,
) => Promise<unknown>;
const TRANSFORMERS_CDN_URL =
	"https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

export default function CamerasPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const ipImageRef = useRef<HTMLImageElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const barModelCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const barModelBusyRef = useRef(false);
	const barModelDetectorRef = useRef<BarModelDetector | null>(null);
	const barModelDetectorPromiseRef = useRef<Promise<BarModelDetector> | null>(
		null,
	);
	const barModelRuntimeRef = useRef<BarModelRuntime | null>(null);
	const gateDraggingRef = useRef(false);
	const streamRef = useRef<MediaStream | null>(null);
	const busyRef = useRef(false);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [running, setRunning] = useState(false);
	const [startingCamera, setStartingCamera] = useState(false);
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
	const [mode, setMode] = useState<CameraMode>("presence");
	const [countingLine, setCountingLine] = useState<CountingLine>(
		defaultCountingLine(),
	);
	const [countingDirection, setCountingDirection] =
		useState<CountingDirection>("left_to_right");
	const [barTracks, setBarTracks] = useState<BarTrack[]>([]);
	const barTracksRef = useRef<BarTrack[]>([]);
	const [barCandidates, setBarCandidates] = useState<
		Array<{
			type: BarItemType;
			confidence: number;
			bbox: BoundingBox;
			label: string;
		}>
	>([]);
	const barCandidatesRef = useRef<typeof barCandidates>([]);
	const [barEvents, setBarEvents] = useState<BarExitEvent[]>([]);
	const [barDetectionCount, setBarDetectionCount] = useState(0);
	const [barRawDetectionCount, setBarRawDetectionCount] = useState(0);
	const [barInferenceMs, setBarInferenceMs] = useState<number | null>(null);
	const [barModelStatus, setBarModelStatus] = useState<BarModelStatus>("idle");
	const [barModelProgress, setBarModelProgress] = useState(0);
	const [barModelRuntime, setBarModelRuntime] =
		useState<BarModelRuntime | null>(null);
	const lastBarModelAtRef = useRef(0);
	const barSessionIdRef = useRef(createVisionSessionId());
	const loadedBarConfigForRef = useRef<number | null>(null);
	const [enabledBarItems, setEnabledBarItems] = useState<
		Record<BarItemType, boolean>
	>({
		plate: true,
		glass: true,
		bottle: true,
		can: true,
	});
	const stablePresenceRef = useRef(stablePresence);
	const presenceSamplesRef = useRef<PresenceSample[]>([]);
	const lastPresenceRecordRef = useRef({
		at: 0,
		status: "",
		personCount: -1,
	});
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
	const selectedCameraId = selected?.id ?? null;

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

	useEffect(() => {
		if (selectedCameraId === null) return;
		loadedBarConfigForRef.current = null;
		try {
			const raw = window.localStorage.getItem(
				`camera-bar-config:${selectedCameraId}`,
			);
			if (raw) {
				const saved = JSON.parse(raw) as {
					line?: CountingLine;
					direction?: CountingDirection;
					enabledItems?: Partial<Record<BarItemType, boolean>>;
				};
				if (saved.line) setCountingLine(normalizeLine(saved.line));
				if (saved.direction && isCountingDirection(saved.direction)) {
					setCountingDirection(saved.direction);
				}
				if (saved.enabledItems) {
					setEnabledBarItems((current) => ({
						...current,
						...saved.enabledItems,
					}));
				}
			}
		} catch {
			window.localStorage.removeItem(`camera-bar-config:${selectedCameraId}`);
		}
		loadedBarConfigForRef.current = selectedCameraId;
	}, [selectedCameraId]);

	useEffect(() => {
		if (
			selectedCameraId === null ||
			loadedBarConfigForRef.current !== selectedCameraId
		) {
			return;
		}
		window.localStorage.setItem(
			`camera-bar-config:${selectedCameraId}`,
			JSON.stringify({
				line: countingLine,
				direction: countingDirection,
				enabledItems: enabledBarItems,
			}),
		);
	}, [selectedCameraId, countingLine, countingDirection, enabledBarItems]);

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

	const recordBarExit = useMutation(
		trpc.cameras.recordBarExit.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(
					trpc.cameras.overview.queryOptions(),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const mutateObservation = recordObservation.mutate;
	const mutateBarExit = recordBarExit.mutate;

	const getObjectDetector = useCallback(async () => {
		if (objectDetectorRef.current) return objectDetectorRef.current;
		if (!objectDetectorPromiseRef.current) {
			setDetectorStatus("loading");
			objectDetectorPromiseRef.current = (async () => {
				const tf = await import("@tensorflow/tfjs");
				try {
					await tf.setBackend("webgl");
				} catch {
					// TensorFlow keeps its available CPU backend as a safe fallback.
				}
				await tf.ready();
				const cocoSsd = await import("@tensorflow-models/coco-ssd");
				const detector = await cocoSsd.load({ base: "mobilenet_v2" });
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

	const getBarFallbackDetector = useCallback(async () => {
		const detector = await getObjectDetector();
		barModelDetectorRef.current = null;
		barModelDetectorPromiseRef.current = null;
		barModelRuntimeRef.current = "coco";
		setBarModelRuntime("coco");
		setBarModelProgress(100);
		setBarModelStatus("ready");
		return detector;
	}, [getObjectDetector]);

	const getBarModelDetector = useCallback(
		async (forceCompatible = false) => {
			if (forceCompatible) {
				barModelDetectorRef.current = null;
				barModelDetectorPromiseRef.current = null;
				barModelRuntimeRef.current = null;
				setBarModelRuntime(null);
			}
			if (barModelDetectorRef.current) return barModelDetectorRef.current;
			if (!barModelDetectorPromiseRef.current) {
				const gpuAvailable = Boolean(
					(navigator as Navigator & { gpu?: unknown }).gpu,
				);
				setBarModelStatus("loading");
				setBarModelProgress(0);
				barModelDetectorPromiseRef.current = (async () => {
					const moduleUrl = TRANSFORMERS_CDN_URL;
					const { pipeline } = (await import(
						/* webpackIgnore: true */ moduleUrl
					)) as {
						pipeline: TransformersPipeline;
					};
					const { detector, runtime } = await loadBarModelWithFallback({
						pipeline,
						gpuAvailable: gpuAvailable && !forceCompatible,
						onProgress: setBarModelProgress,
					});
					barModelDetectorRef.current = detector;
					barModelRuntimeRef.current = runtime;
					setBarModelRuntime(runtime);
					setBarModelProgress(100);
					setBarModelStatus("ready");
					return detector;
				})().catch(async () => {
					barModelDetectorPromiseRef.current = null;
					barModelRuntimeRef.current = null;
					setBarModelRuntime(null);
					await getBarFallbackDetector();
					const fallbackDetector: BarModelDetector = async () => [];
					return fallbackDetector;
				});
			}
			return barModelDetectorPromiseRef.current;
		},
		[getBarFallbackDetector],
	);

	const stopCamera = useCallback(() => {
		for (const track of streamRef.current?.getTracks() ?? []) {
			track.stop();
		}
		const overlay = overlayCanvasRef.current;
		overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
		streamRef.current = null;
		setRunning(false);
	}, []);

	const resetBarTracking = useCallback(() => {
		barTracksRef.current = [];
		barCandidatesRef.current = [];
		lastBarModelAtRef.current = 0;
		barSessionIdRef.current = createVisionSessionId();
		setBarTracks([]);
		setBarCandidates([]);
		setBarDetectionCount(0);
		setBarRawDetectionCount(0);
		setBarInferenceMs(null);
	}, []);

	const startCamera = async () => {
		if (!selected || startingCamera) return;
		const prepareDetector = () => {
			const promise =
				mode === "bar_exit" ? getBarModelDetector() : getObjectDetector();
			void promise.catch((error) => {
				if (mode === "bar_exit") {
					setCameraError(
						error instanceof Error ? error.message : "No se pudo cargar OWLv2.",
					);
				}
			});
		};
		setStartingCamera(true);
		setCameraError(null);
		if (draft.sourceType === "ip_camera") {
			if (!draft.streamUrl.trim()) {
				setCameraError("Agrega la URL HTTP/MJPEG/snapshot de la cámara IP.");
				setStartingCamera(false);
				return;
			}
			setRunning(true);
			prepareDetector();
			toast.success("Camara IP activada.");
			setStartingCamera(false);
			return;
		}
		try {
			const stream = await openCameraStream();
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}
			setRunning(true);
			prepareDetector();
			toast.success("Camara encendida.");
		} catch (error) {
			const message = cameraAccessMessage(error);
			setCameraError(message);
			mutateObservation({
				cameraId: selected.id,
				personCount: 0,
				confidenceAvg: null,
				status: "camera_error",
			});
		} finally {
			setStartingCamera(false);
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
		(
			canvas: HTMLCanvasElement,
			people: DetectedObject[],
			tracks: BarTrack[] = [],
			candidates: Array<{
				type: BarItemType;
				confidence: number;
				bbox: BoundingBox;
				label: string;
			}> = [],
		) => {
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
			if (mode === "bar_exit") {
				const line = lineToCanvas(countingLine, canvas);
				const region = trackingRegion(countingLine, countingDirection);
				context.fillStyle = "rgba(56, 189, 248, 0.08)";
				context.strokeStyle = "rgba(56, 189, 248, 0.75)";
				context.setLineDash([8, 8]);
				context.fillRect(
					region.x * canvas.width,
					region.y * canvas.height,
					region.width * canvas.width,
					region.height * canvas.height,
				);
				context.strokeRect(
					region.x * canvas.width,
					region.y * canvas.height,
					region.width * canvas.width,
					region.height * canvas.height,
				);
				context.setLineDash([]);
				context.strokeStyle = "rgba(245, 158, 11, 0.28)";
				context.lineWidth = Math.max(28, canvas.width * 0.025);
				context.beginPath();
				context.moveTo(line.start.x, line.start.y);
				context.lineTo(line.end.x, line.end.y);
				context.stroke();
				context.strokeStyle = "#f59e0b";
				context.lineWidth = Math.max(4, canvas.width * 0.004);
				context.setLineDash([14, 10]);
				context.beginPath();
				context.moveTo(line.start.x, line.start.y);
				context.lineTo(line.end.x, line.end.y);
				context.stroke();
				context.setLineDash([]);
				context.fillStyle = "rgba(0,0,0,0.75)";
				context.fillRect(12, 12, 280, 30);
				context.fillStyle = "#fff";
				context.fillText(
					`Zona de salida: ${directionLabel(countingDirection)}`,
					22,
					34,
				);
				context.lineWidth = Math.max(3, Math.round(canvas.width / 320));

				for (const candidate of candidates) {
					const [x, y, width, height] = candidate.bbox;
					context.strokeStyle = "rgba(56, 189, 248, 0.72)";
					context.fillStyle = "rgba(2, 6, 23, 0.74)";
					context.setLineDash([6, 6]);
					context.strokeRect(x, y, width, height);
					context.setLineDash([]);
					const label = `candidato ${itemLabel(candidate.type)} ${Math.round(
						candidate.confidence * 100,
					)}%`;
					const labelWidth = context.measureText(label).width + 12;
					const labelY = Math.max(0, y - 26);
					context.fillRect(x, labelY, labelWidth, 24);
					context.fillStyle = "#fff";
					context.fillText(label, x + 6, labelY + 17);
				}

				for (const track of tracks.filter(isVisibleBarTrack)) {
					const [x, y, width, height] = track.bbox;
					context.strokeStyle = track.counted ? "#22c55e" : "#38bdf8";
					context.fillStyle = "rgba(0,0,0,0.72)";
					context.strokeRect(x, y, width, height);
					if (track.previousCenter) {
						context.beginPath();
						context.moveTo(track.previousCenter.x, track.previousCenter.y);
						context.lineTo(track.center.x, track.center.y);
						context.stroke();
					}
					const label = `${itemLabel(track.type)} ${Math.round(
						track.confidence * 100,
					)}%${track.counted ? " · contado" : ""}`;
					const labelWidth = context.measureText(label).width + 12;
					const labelY = Math.max(0, y - 26);
					context.fillRect(x, labelY, labelWidth, 24);
					context.fillStyle = "#fff";
					context.fillText(label, x + 6, labelY + 17);
				}
				return;
			}
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
		[countingDirection, countingLine, mode],
	);

	const processBarExitFrame = useCallback(
		async (canvas: HTMLCanvasElement) => {
			if (!selected) return;
			const now = Date.now();
			drawDetections(
				canvas,
				[],
				barTracksRef.current,
				barCandidatesRef.current,
			);
			if (barModelStatus === "idle") {
				void getBarModelDetector().catch(() => undefined);
				return;
			}
			if (
				barModelStatus !== "ready" ||
				(barModelRuntimeRef.current !== "coco" &&
					!barModelDetectorRef.current) ||
				barModelBusyRef.current ||
				now - lastBarModelAtRef.current < 500
			) {
				return;
			}

			barModelBusyRef.current = true;
			lastBarModelAtRef.current = now;
			const inferenceStartedAt = performance.now();
			try {
				if (!barModelCanvasRef.current) {
					barModelCanvasRef.current = document.createElement("canvas");
				}
				const modelCanvas = barModelCanvasRef.current;
				const region = trackingRegion(countingLine, countingDirection);
				const crop = regionToPixels(region, canvas.width, canvas.height);
				modelCanvas.width = Math.max(320, Math.min(800, crop.width));
				modelCanvas.height = Math.max(
					240,
					Math.round((crop.height / crop.width) * modelCanvas.width),
				);
				const modelContext = modelCanvas.getContext("2d");
				if (!modelContext) return;
				modelContext.drawImage(
					canvas,
					crop.x,
					crop.y,
					crop.width,
					crop.height,
					0,
					0,
					modelCanvas.width,
					modelCanvas.height,
				);
				const scaleX = crop.width / modelCanvas.width;
				const scaleY = crop.height / modelCanvas.height;
				const baseCandidates =
					barModelRuntimeRef.current === "coco"
						? candidatesFromCocoDetections(
								(await getObjectDetector().then((detector) =>
									detector.detect(modelCanvas),
								)) as Array<{
									class: string;
									score: number;
									bbox: BoundingBox;
								}>,
								{
									width: modelCanvas.width,
									height: modelCanvas.height,
								},
							)
						: candidatesFromOwlDetections(
								await runOwlBarDetector({
									detector: barModelDetectorRef.current,
									modelCanvas,
									getBarModelDetector,
									getBarFallbackDetector,
									setBarModelRuntime,
									setBarModelStatus,
									runtimeRef: barModelRuntimeRef,
									detectorRef: barModelDetectorRef,
									detectorPromiseRef: barModelDetectorPromiseRef,
								}),
								{
									width: modelCanvas.width,
									height: modelCanvas.height,
								},
							);
				const candidates = baseCandidates
					.filter((candidate) => enabledBarItems[candidate.type])
					.map((candidate) => {
						const bbox: BoundingBox = [
							crop.x + candidate.bbox[0] * scaleX,
							crop.y + candidate.bbox[1] * scaleY,
							candidate.bbox[2] * scaleX,
							candidate.bbox[3] * scaleY,
						];
						return {
							...candidate,
							bbox,
							appearance: colorSignature(canvas, bbox),
						};
					});
				barCandidatesRef.current = candidates;
				setBarCandidates(candidates);
				setBarRawDetectionCount(candidates.length);
				const tracked = updateBarTracks(barTracksRef.current, candidates, {
					now: Date.now(),
					line: lineToCanvas(countingLine, canvas),
					direction: countingDirection,
					frameWidth: canvas.width,
					frameHeight: canvas.height,
					minHits: 3,
					minConfirmMs: 450,
					maxMisses: 4,
					maxLostMs: 2_400,
					lineTolerance: Math.max(7, canvas.width * 0.009),
					minTravelDistance: Math.max(24, canvas.width * 0.035),
					gatePadding: Math.max(12, canvas.width * 0.025),
					idPrefix: barSessionIdRef.current,
				});
				barTracksRef.current = tracked.tracks;
				setBarTracks(tracked.tracks);
				setBarDetectionCount(tracked.tracks.filter(isVisibleBarTrack).length);
				if (tracked.events.length > 0) {
					setBarEvents((current) =>
						[...tracked.events, ...current].slice(0, 20),
					);
					for (const event of tracked.events) {
						mutateBarExit({
							cameraId: selected.id,
							trackId: event.trackId,
							itemType: event.type,
							confidenceAvg: event.confidence,
							direction: event.direction,
							zone: draft.location || "Barra",
						});
					}
				}
				drawDetections(canvas, [], tracked.tracks, candidates);
				setBarInferenceMs(Math.round(performance.now() - inferenceStartedAt));
				setDetection({
					configured: true,
					personCount: 0,
					confidenceAvg: null,
					message: "OWLv2 y seguimiento temporal activos.",
				});
			} catch (error) {
				setBarModelStatus("error");
				setCameraError(
					error instanceof Error
						? `Falló OWLv2: ${error.message}`
						: "Falló el detector OWLv2.",
				);
			} finally {
				barModelBusyRef.current = false;
			}
		},
		[
			barModelStatus,
			countingDirection,
			countingLine,
			drawDetections,
			draft.location,
			enabledBarItems,
			getBarFallbackDetector,
			getBarModelDetector,
			getObjectDetector,
			mutateBarExit,
			selected,
		],
	);

	const detectOnce = useCallback(async () => {
		if (!selected || !canvasRef.current || busyRef.current) return;
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

		const persistObservation = (
			status: string,
			personCount: number,
			confidenceAvg: number | null,
		) => {
			const now = Date.now();
			const previous = lastPresenceRecordRef.current;
			if (
				status === previous.status &&
				personCount === previous.personCount &&
				now - previous.at < 5_000
			) {
				return;
			}
			lastPresenceRecordRef.current = { at: now, status, personCount };
			mutateObservation({
				cameraId: selected.id,
				personCount,
				confidenceAvg,
				status: status as
					| "person_detected"
					| "multiple_people"
					| "empty"
					| "camera_error"
					| "model_not_configured",
			});
		};

		busyRef.current = true;
		if (mode !== "bar_exit") setBusy(true);
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
			if (mode === "bar_exit") {
				await processBarExitFrame(canvas);
				return;
			}
			try {
				const detector = await getObjectDetector();
				const predictions = await detector.detect(canvas, 30, 0.22);
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
				const presenceStatus =
					stable.personCount > 1
						? "multiple_people"
						: stable.personCount > 0
							? "person_detected"
							: "empty";
				persistObservation(
					presenceStatus,
					stable.personCount,
					result.confidenceAvg,
				);
				return;
			} catch (error) {
				const message =
					error instanceof Error
						? `Detector local no disponible: ${error.message}`
						: "Detector local no disponible.";
				setCameraError(message);
				setDetection({
					configured: true,
					personCount: 0,
					confidenceAvg: null,
					error: message,
				});
				persistObservation("camera_error", 0, null);
				return;
			}
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
			persistObservation("camera_error", 0, null);
		} finally {
			busyRef.current = false;
			if (mode !== "bar_exit") setBusy(false);
		}
	}, [
		drawDetections,
		getObjectDetector,
		draft.sourceType,
		mode,
		processBarExitFrame,
		mutateObservation,
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
			timeout = setTimeout(loop, mode === "bar_exit" ? 90 : 250);
		};

		timeout = setTimeout(loop, 250);
		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [detectOnce, mode, running, selected]);

	useEffect(() => () => stopCamera(), [stopCamera]);

	const openAlerts = (data?.alerts ?? []).filter(
		(alert) => alert.status === "open",
	);
	const savedExitEvents = data?.exitEvents ?? [];
	const sessionExitSummary = summarizeExitEvents(barEvents);
	const savedExitSummary = summarizeExitEvents(savedExitEvents);
	const savedExitCount = savedExitEvents.length;
	const sessionExitCount = barEvents.length;
	const confirmedBarTracks = barTracks.filter(isVisibleBarTrack);

	useEffect(() => {
		const resetKey = `${mode}:${countingDirection}:${countingLine.start.x}:${countingLine.start.y}:${countingLine.end.x}:${countingLine.end.y}`;
		if (!resetKey) return;
		barTracksRef.current = [];
		setBarTracks([]);
	}, [mode, countingLine, countingDirection]);

	useEffect(() => {
		if (mode === "bar_exit") {
			void getBarModelDetector().catch(() => undefined);
			if (running) resetBarTracking();
			return;
		}
		if (!running) return;
		void getObjectDetector().catch(() => undefined);
	}, [mode, running, resetBarTracking, getBarModelDetector, getObjectDetector]);

	const moveCountingGate = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (mode !== "bar_exit") return;
			const rect = event.currentTarget.getBoundingClientRect();
			setCountingLine(
				placeCountingGate(countingDirection, {
					x: (event.clientX - rect.left) / Math.max(1, rect.width),
					y: (event.clientY - rect.top) / Math.max(1, rect.height),
				}),
			);
		},
		[countingDirection, mode],
	);

	const handleOverlayPointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (mode !== "bar_exit") return;
			gateDraggingRef.current = true;
			event.currentTarget.setPointerCapture(event.pointerId);
			moveCountingGate(event);
		},
		[mode, moveCountingGate],
	);

	const handleOverlayPointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (!gateDraggingRef.current) return;
			moveCountingGate(event);
		},
		[moveCountingGate],
	);

	const handleOverlayPointerUp = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			gateDraggingRef.current = false;
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		},
		[],
	);

	const changeCountingDirection = useCallback(
		(direction: CountingDirection) => {
			setCountingDirection(direction);
			setCountingLine((current) => {
				const center = {
					x: (current.start.x + current.end.x) / 2,
					y: (current.start.y + current.end.y) / 2,
				};
				return placeCountingGate(direction, center);
			});
		},
		[],
	);

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<CameraIcon className="h-6 w-6 text-primary" />
							<h1 className="font-bold text-2xl">Camaras operativas</h1>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Deteccion local para presencia y conteo de pedidos al salir de la
							barra.
						</p>
					</div>
					<Badge
						variant={
							mode === "bar_exit"
								? barModelStatus === "error" || barModelStatus === "unsupported"
									? "destructive"
									: "default"
								: detectorStatus === "error"
									? "destructive"
									: "default"
						}
					>
						{mode === "bar_exit"
							? barModelStatusLabel(
									barModelStatus,
									barModelProgress,
									barModelRuntime,
								)
							: detectorStatus === "ready"
								? "Detector local listo"
								: detectorStatus === "loading"
									? "Cargando detector"
									: detectorStatus === "error"
										? "Detector local con error"
										: "Detector local"}
					</Badge>
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-2">
					<ModeButton
						active={mode === "presence"}
						title="Presencia"
						description="Cuenta personas en un puesto."
						onClick={() => setMode("presence")}
					/>
					<ModeButton
						active={mode === "bar_exit"}
						title="Salida de barra"
						description="Cuenta platos, vasos, botellas y latas por cruce."
						onClick={() => setMode("bar_exit")}
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Metric icon={CameraIcon} label="Camaras" value={devices.length} />
				<Metric
					icon={mode === "bar_exit" ? PackageIcon : UsersIcon}
					label={mode === "bar_exit" ? "Salidas hoy" : "Personas ahora"}
					value={
						mode === "bar_exit"
							? savedExitCount + sessionExitCount
							: stablePresence.personCount ||
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
					label={mode === "bar_exit" ? "Objetos visibles" : "Ultima deteccion"}
					value={
						mode === "bar_exit"
							? barDetectionCount
							: selected?.lastSeenAt
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
							{mode === "bar_exit"
								? "Conteo en salida de barra"
								: draft.sourceType === "ip_camera"
									? "Camara IP / stream"
									: "Webcam de prueba"}
						</CardTitle>
						<CardDescription>
							{mode === "bar_exit"
								? "Arrastra la línea naranja hasta el punto de salida. Solo se cuentan objetos confirmados por OWLv2 al completar el cruce."
								: "La webcam sirve para demo. Para camara IP usa una URL HTTP/MJPEG o snapshot accesible desde la misma red."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative overflow-hidden rounded-2xl border bg-black">
							{draft.sourceType === "ip_camera" ? (
								// biome-ignore lint/performance/noImgElement: MJPEG camera streams require a native img element.
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
								onPointerDown={handleOverlayPointerDown}
								onPointerMove={handleOverlayPointerMove}
								onPointerUp={handleOverlayPointerUp}
								onPointerCancel={handleOverlayPointerUp}
								className={`absolute inset-0 h-full w-full ${
									mode === "bar_exit"
										? "cursor-pointer touch-none"
										: "pointer-events-none"
								}`}
							/>
						</div>
						<canvas ref={canvasRef} className="hidden" />
						<div className="flex flex-wrap items-center gap-2">
							<Button
								onClick={startCamera}
								disabled={running || !selected || startingCamera}
							>
								{startingCamera ? (
									<RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
								) : draft.sourceType === "ip_camera" ? (
									<NetworkIcon className="mr-2 h-4 w-4" />
								) : (
									<CameraIcon className="mr-2 h-4 w-4" />
								)}
								{startingCamera
									? "Solicitando cámara"
									: draft.sourceType === "ip_camera"
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
							{mode !== "bar_exit" ? (
								<Button
									variant="outline"
									onClick={detectOnce}
									disabled={!running || busy}
								>
									<RefreshCwIcon className="mr-2 h-4 w-4" />
									Analizar ahora
								</Button>
							) : null}
						</div>
						{mode === "bar_exit" ? (
							<BarExitPanel
								countingDirection={countingDirection}
								setCountingDirection={changeCountingDirection}
								enabledBarItems={enabledBarItems}
								setEnabledBarItems={setEnabledBarItems}
								barDetectionCount={barDetectionCount}
								barRawDetectionCount={barRawDetectionCount}
								barTracks={confirmedBarTracks}
								modelStatus={barModelStatus}
								modelRuntime={barModelRuntime}
								inferenceMs={barInferenceMs}
								sessionExitSummary={sessionExitSummary}
								savedExitSummary={savedExitSummary}
								sessionExitCount={sessionExitCount}
								savedExitCount={savedExitCount}
								onCenterGate={() =>
									setCountingLine(
										placeCountingGate(countingDirection, {
											x: 0.5,
											y: 0.5,
										}),
									)
								}
								onReset={() => {
									resetBarTracking();
									setBarEvents([]);
								}}
							/>
						) : (
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
						)}
						{cameraError && (
							<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
								{cameraError}
							</div>
						)}
						{mode === "bar_exit" ? (
							<BarEngineStatus
								modelStatus={barModelStatus}
								modelProgress={barModelProgress}
								modelRuntime={barModelRuntime}
								visibleObjects={barDetectionCount}
								activeTracks={confirmedBarTracks.length}
								inferenceMs={barInferenceMs}
							/>
						) : (
							<DetectionStatus
								result={detection}
								busy={busy}
								detectorStatus={detectorStatus}
								stablePresence={stablePresence}
							/>
						)}
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
						<CardTitle>
							{mode === "bar_exit" ? "Salidas recientes" : "Lecturas recientes"}
						</CardTitle>
						<CardDescription>
							{mode === "bar_exit"
								? "Pedidos verificados al cruzar la zona de salida."
								: "Muestras guardadas para comprobar que el módulo está trabajando."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{mode === "bar_exit" ? (
							<ExitEventsTable
								events={[...barEvents, ...savedExitEvents].slice(0, 14)}
								isLoading={isLoading}
							/>
						) : (
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
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function ModeButton({
	active,
	title,
	description,
	onClick,
}: {
	active: boolean;
	title: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-2xl border p-4 text-left transition ${
				active ? "border-primary bg-primary/10" : "hover:bg-muted"
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<div>
					<div className="font-semibold">{title}</div>
					<div className="text-muted-foreground text-xs">{description}</div>
				</div>
				<ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
			</div>
		</button>
	);
}

function BarExitPanel({
	countingDirection,
	setCountingDirection,
	enabledBarItems,
	setEnabledBarItems,
	barDetectionCount,
	barRawDetectionCount,
	barTracks,
	modelStatus,
	modelRuntime,
	inferenceMs,
	sessionExitSummary,
	savedExitSummary,
	sessionExitCount,
	savedExitCount,
	onCenterGate,
	onReset,
}: {
	countingDirection: CountingDirection;
	setCountingDirection: (direction: CountingDirection) => void;
	enabledBarItems: Record<BarItemType, boolean>;
	setEnabledBarItems: React.Dispatch<
		React.SetStateAction<Record<BarItemType, boolean>>
	>;
	barDetectionCount: number;
	barRawDetectionCount: number;
	barTracks: BarTrack[];
	modelStatus: BarModelStatus;
	modelRuntime: BarModelRuntime | null;
	inferenceMs: number | null;
	sessionExitSummary: Record<BarItemType, number>;
	savedExitSummary: Record<BarItemType, number>;
	sessionExitCount: number;
	savedExitCount: number;
	onCenterGate: () => void;
	onReset: () => void;
}) {
	const directions: CountingDirection[] = [
		"left_to_right",
		"right_to_left",
		"top_to_bottom",
		"bottom_to_top",
	];
	const items: BarItemType[] = ["plate", "glass", "bottle", "can"];
	const ready = modelStatus === "ready";

	return (
		<div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm">
			<div className="mb-4 flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<div
						className={
							"mt-1 h-2.5 w-2.5 rounded-full" +
							(ready
								? "bg-emerald-500"
								: modelStatus === "error" || modelStatus === "unsupported"
									? "bg-red-500"
									: "bg-amber-500")
						}
					/>
					<div>
						<div className="font-semibold">
							{ready
								? modelRuntime === "wasm" || modelRuntime === "coco"
									? "Conteo listo (compatible)"
									: "Conteo listo"
								: barModelStatusLabel(modelStatus, 0, modelRuntime)}
						</div>
						<div className="text-muted-foreground text-xs">
							Arrastra la línea naranja sobre el punto por donde salen los
							pedidos.
						</div>
					</div>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onCenterGate}
				>
					Centrar línea
				</Button>
			</div>

			<div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
				<div>
					<div className="font-semibold text-base">Qué debe contar</div>
					<div className="mt-1 text-muted-foreground text-xs">
						Las propuestas débiles se descartan y un objeto necesita varias
						lecturas coherentes antes de aparecer.
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{items.map((item) => (
							<Button
								key={item}
								type="button"
								size="sm"
								variant={enabledBarItems[item] ? "default" : "outline"}
								onClick={() =>
									setEnabledBarItems((current) => ({
										...current,
										[item]: !current[item],
									}))
								}
							>
								{itemLabel(item)}
							</Button>
						))}
					</div>

					<div className="mt-5 font-semibold text-base">
						Dirección de salida
					</div>
					<div className="mt-2 grid gap-2 sm:grid-cols-2">
						{directions.map((direction) => (
							<Button
								key={direction}
								type="button"
								size="sm"
								variant={
									countingDirection === direction ? "default" : "outline"
								}
								onClick={() => setCountingDirection(direction)}
							>
								{directionLabel(direction)}
							</Button>
						))}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2 text-center text-xs">
					<SmallStat
						label="candidatos del modelo"
						value={barRawDetectionCount}
					/>
					<SmallStat label="objetos confirmados" value={barDetectionCount} />
					<SmallStat
						label="tiempo por lectura"
						value={inferenceMs === null ? "—" : `${inferenceMs} ms`}
					/>
					<SmallStat
						label="seguimientos activos"
						value={barTracks.filter((track) => track.misses === 0).length}
					/>
					<SmallStat label="cruces sesion" value={sessionExitCount} />
					<SmallStat label="guardados hoy" value={savedExitCount} />
					<SmallStat label="platos sesion" value={sessionExitSummary.plate} />
					<SmallStat
						label="vasos/copas sesion"
						value={sessionExitSummary.glass}
					/>
					<SmallStat
						label="botellas sesion"
						value={sessionExitSummary.bottle}
					/>
					<SmallStat label="latas sesion" value={sessionExitSummary.can} />
					<SmallStat label="platos hoy" value={savedExitSummary.plate} />
					<SmallStat label="vasos hoy" value={savedExitSummary.glass} />
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="col-span-2"
						onClick={onReset}
					>
						Reiniciar conteo local
					</Button>
				</div>
			</div>
		</div>
	);
}

function SmallStat({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="rounded-xl bg-background px-3 py-2">
			<div className="font-bold text-base">{value}</div>
			<div className="text-muted-foreground">{label}</div>
		</div>
	);
}

type ExitEventRow =
	| BarExitEvent
	| {
			id: number;
			trackId: string;
			itemType: string;
			confidenceAvg: number | null;
			direction: string;
			zone: string;
			createdAt: string | null;
	  };

function ExitEventsTable({
	events,
	isLoading,
}: {
	events: ExitEventRow[];
	isLoading: boolean;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Hora</TableHead>
					<TableHead>Objeto</TableHead>
					<TableHead>Track</TableHead>
					<TableHead>Dirección</TableHead>
					<TableHead>Confianza</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{events.map((event) => {
					const type = eventType(event);
					const time = "time" in event ? event.time : event.createdAt;
					return (
						<TableRow key={eventRowKey(event)}>
							<TableCell>
								{time ? new Date(time).toLocaleTimeString() : "-"}
							</TableCell>
							<TableCell>
								<Badge variant="outline">{itemLabel(type)}</Badge>
							</TableCell>
							<TableCell className="font-mono text-xs">
								{eventTrackId(event)}
							</TableCell>
							<TableCell>{directionLabel(eventDirection(event))}</TableCell>
							<TableCell>
								{eventConfidence(event)
									? `${Math.round((eventConfidence(event) ?? 0) * 100)}%`
									: "-"}
							</TableCell>
						</TableRow>
					);
				})}
				{!isLoading && events.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={5}
							className="text-center text-muted-foreground"
						>
							Enciende la cámara, toca la salida en el video y cruza un pedido
							frente a la barra.
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
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

function BarEngineStatus({
	modelStatus,
	modelProgress,
	modelRuntime,
	visibleObjects,
	activeTracks,
	inferenceMs,
}: {
	modelStatus: BarModelStatus;
	modelProgress: number;
	modelRuntime: BarModelRuntime | null;
	visibleObjects: number;
	activeTracks: number;
	inferenceMs: number | null;
}) {
	if (modelStatus === "unsupported" || modelStatus === "error") {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
				<AlertTriangleIcon className="mt-0.5 h-4 w-4" />
				<div>
					<div className="font-medium">El detector no está disponible</div>
					<div>
						{modelStatus === "unsupported"
							? "El navegador no permite ejecutar el modelo local."
							: "El detector principal fallo; el sistema intentara usar el modo compatible."}
					</div>
				</div>
			</div>
		);
	}

	if (modelStatus === "loading") {
		return (
			<div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sky-950 text-sm dark:bg-sky-950/30 dark:text-sky-100">
				<div className="flex items-center gap-2 font-medium">
					<RefreshCwIcon className="h-4 w-4 animate-spin" />
					Preparando detector ({modelProgress}%)
				</div>
				<div className="mt-1 text-xs opacity-80">
					La descarga cuantizada es de aproximadamente 128 MB y después queda
					guardada en el navegador.
				</div>
			</div>
		);
	}

	if (modelStatus !== "ready") {
		return (
			<div className="rounded-xl border bg-muted p-3 text-muted-foreground text-sm">
				Enciende la cámara para preparar el detector.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50 p-3 text-emerald-950 text-sm sm:flex-row sm:items-center sm:justify-between dark:bg-emerald-950/25 dark:text-emerald-100">
			<div className="flex items-center gap-2 font-medium">
				<CheckCircle2Icon className="h-4 w-4" />
				{modelRuntime === "wasm" || modelRuntime === "coco"
					? "Detector activo en modo compatible"
					: "Detector activo"}
			</div>
			<div className="flex flex-wrap gap-4 text-xs">
				<span>{visibleObjects} objeto(s) confirmados</span>
				<span>{activeTracks} seguimiento(s)</span>
				{inferenceMs !== null ? <span>{inferenceMs} ms</span> : null}
			</div>
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
	if (prediction.score < 0.45) return false;
	const [, , width, height] = prediction.bbox;
	const areaRatio =
		(width * height) / Math.max(1, canvas.width * canvas.height);
	const heightRatio = height / Math.max(1, canvas.height);
	const widthRatio = width / Math.max(1, canvas.width);
	if (areaRatio < 0.008 || heightRatio < 0.12 || widthRatio < 0.035) {
		return false;
	}
	return areaRatio >= 0.02 || prediction.score >= 0.58;
}

function isVisibleBarTrack(track: BarTrack) {
	return track.state === "confirmed" && track.misses <= 2;
}

function lineToCanvas(
	line: CountingLine,
	canvas: HTMLCanvasElement,
): CountingLine {
	const normalized = normalizeLine(line);
	return {
		start: {
			x: normalized.start.x * canvas.width,
			y: normalized.start.y * canvas.height,
		},
		end: {
			x: normalized.end.x * canvas.width,
			y: normalized.end.y * canvas.height,
		},
	};
}

function regionToPixels(
	region: { x: number; y: number; width: number; height: number },
	frameWidth: number,
	frameHeight: number,
) {
	const x = Math.max(0, Math.floor(region.x * frameWidth));
	const y = Math.max(0, Math.floor(region.y * frameHeight));
	return {
		x,
		y,
		width: Math.max(
			1,
			Math.min(frameWidth - x, Math.ceil(region.width * frameWidth)),
		),
		height: Math.max(
			1,
			Math.min(frameHeight - y, Math.ceil(region.height * frameHeight)),
		),
	};
}

function colorSignature(
	canvas: HTMLCanvasElement,
	bbox: BoundingBox,
): number[] | undefined {
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return undefined;
	const x = Math.max(0, Math.floor(bbox[0]));
	const y = Math.max(0, Math.floor(bbox[1]));
	const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(bbox[2])));
	const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(bbox[3])));
	try {
		const pixels = context.getImageData(x, y, width, height).data;
		const bins = new Array<number>(12).fill(0);
		const pixelCount = width * height;
		const step = Math.max(1, Math.floor(Math.sqrt(pixelCount / 500)));
		let samples = 0;
		for (let pixel = 0; pixel < pixelCount; pixel += step) {
			const offset = pixel * 4;
			const red = pixels[offset] ?? 0;
			const green = pixels[offset + 1] ?? 0;
			const blue = pixels[offset + 2] ?? 0;
			bins[Math.min(3, Math.floor(red / 64))] += 1;
			bins[4 + Math.min(3, Math.floor(green / 64))] += 1;
			bins[8 + Math.min(3, Math.floor(blue / 64))] += 1;
			samples += 1;
		}
		return bins.map((value) => value / Math.max(1, samples));
	} catch {
		return undefined;
	}
}

function modelFileProgress(event: unknown) {
	if (!event || typeof event !== "object") return null;
	const progressEvent = event as {
		progress?: unknown;
		total?: unknown;
		file?: unknown;
		name?: unknown;
	};
	if (typeof progressEvent.progress !== "number") return null;
	const total =
		typeof progressEvent.total === "number" ? progressEvent.total : 0;
	const file = String(progressEvent.file ?? progressEvent.name ?? "");
	if (total < 20_000_000 && !/\.onnx(?:_data)?$/i.test(file)) return null;
	return Math.max(0, Math.min(100, Math.round(progressEvent.progress)));
}

async function loadBarModelWithFallback({
	pipeline,
	gpuAvailable,
	onProgress,
}: {
	pipeline: TransformersPipeline;
	gpuAvailable: boolean;
	onProgress: (progress: number) => void;
}): Promise<{ detector: BarModelDetector; runtime: BarModelRuntime }> {
	const attempts: Array<{
		runtime: BarModelRuntime;
		label: string;
		options: Record<string, unknown>;
	}> = [
		...(gpuAvailable
			? [
					{
						runtime: "webgpu" as const,
						label: "WebGPU",
						options: { device: "webgpu", dtype: "q4" },
					},
				]
			: []),
		{
			runtime: "wasm",
			label: "WASM q8",
			options: { dtype: "q8" },
		},
		{
			runtime: "wasm",
			label: "WASM q4",
			options: { dtype: "q4" },
		},
	];
	const errors: string[] = [];

	for (const attempt of attempts) {
		try {
			const loaded = await pipeline(
				"zero-shot-object-detection",
				BAR_MODEL_ID,
				{
					...attempt.options,
					progress_callback: (event: unknown) => {
						const progress = modelFileProgress(event);
						if (progress !== null) onProgress(progress);
					},
				},
			);
			return {
				detector: loaded as unknown as BarModelDetector,
				runtime: attempt.runtime,
			};
		} catch (error) {
			errors.push(
				`${attempt.label}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	throw new Error(errors.join(" | "));
}

async function runOwlBarDetector({
	detector,
	modelCanvas,
	getBarModelDetector,
	getBarFallbackDetector,
	setBarModelRuntime,
	setBarModelStatus,
	runtimeRef,
	detectorRef,
	detectorPromiseRef,
}: {
	detector: BarModelDetector | null;
	modelCanvas: HTMLCanvasElement;
	getBarModelDetector: (forceCompatible?: boolean) => Promise<BarModelDetector>;
	getBarFallbackDetector: () => Promise<ObjectDetection>;
	setBarModelRuntime: (runtime: BarModelRuntime | null) => void;
	setBarModelStatus: (status: BarModelStatus) => void;
	runtimeRef: React.MutableRefObject<BarModelRuntime | null>;
	detectorRef: React.MutableRefObject<BarModelDetector | null>;
	detectorPromiseRef: React.MutableRefObject<Promise<BarModelDetector> | null>;
}): Promise<BarModelDetection[]> {
	if (!detector) {
		await getBarFallbackDetector();
		return [];
	}
	const modelInput = modelCanvas.toDataURL("image/jpeg", 0.92);
	try {
		return await detector(modelInput, [...BAR_MODEL_LABELS], {
			threshold: 0.07,
			top_k: 80,
		});
	} catch {
		if (runtimeRef.current === "webgpu") {
			detectorRef.current = null;
			detectorPromiseRef.current = null;
			runtimeRef.current = null;
			setBarModelRuntime(null);
			setBarModelStatus("loading");
			try {
				const compatibleDetector = await getBarModelDetector(true);
				return await compatibleDetector(modelInput, [...BAR_MODEL_LABELS], {
					threshold: 0.07,
					top_k: 80,
				});
			} catch {
				await getBarFallbackDetector();
				return [];
			}
		}
		await getBarFallbackDetector();
		return [];
	}
}

function barModelStatusLabel(
	status: BarModelStatus,
	progress: number,
	runtime?: BarModelRuntime | null,
) {
	if (status === "ready")
		return runtime === "wasm" || runtime === "coco"
			? "Detector listo (compatible)"
			: "Detector listo";
	if (status === "loading") return `Preparando detector ${progress}%`;
	if (status === "unsupported") return "Detector no disponible";
	if (status === "error") return "Detector con error";
	return "OWLv2";
}

async function openCameraStream() {
	try {
		return await requestCameraStream({
			video: {
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 24 },
				facingMode: { ideal: "environment" },
			},
			audio: false,
		});
	} catch (error) {
		if (
			error instanceof DOMException &&
			(error.name === "OverconstrainedError" || error.name === "NotFoundError")
		) {
			return requestCameraStream({ video: true, audio: false });
		}
		throw error;
	}
}

function requestCameraStream(constraints: MediaStreamConstraints) {
	let expired = false;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const request = navigator.mediaDevices.getUserMedia(constraints);
	void request.then((stream) => {
		if (!expired) return;
		for (const track of stream.getTracks()) track.stop();
	});
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			expired = true;
			reject(
				new Error(
					"No se recibió permiso para usar la cámara. Autoriza la webcam y vuelve a intentarlo.",
				),
			);
		}, 20_000);
	});
	return Promise.race([request, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}

function cameraAccessMessage(error: unknown) {
	if (error instanceof DOMException) {
		if (error.name === "NotAllowedError") {
			return "Permite el acceso a la cámara en el navegador y vuelve a intentarlo.";
		}
		if (error.name === "NotFoundError") {
			return "No se encontró una webcam conectada.";
		}
		if (error.name === "NotReadableError") {
			return "Otra aplicación está usando la webcam. Ciérrala y vuelve a intentarlo.";
		}
		if (error.name === "SecurityError") {
			return "El navegador bloqueó la webcam. Usa HTTPS o localhost.";
		}
	}
	return error instanceof Error ? error.message : "No se pudo abrir la cámara.";
}

function createVisionSessionId() {
	return `vision-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

function isCountingDirection(value: string): value is CountingDirection {
	return [
		"left_to_right",
		"right_to_left",
		"top_to_bottom",
		"bottom_to_top",
	].includes(value);
}

function directionLabel(direction: CountingDirection | string) {
	const labels: Record<CountingDirection, string> = {
		left_to_right: "Izquierda → derecha",
		right_to_left: "Derecha → izquierda",
		top_to_bottom: "Arriba → abajo",
		bottom_to_top: "Abajo → arriba",
	};
	return labels[direction as CountingDirection] ?? direction;
}

function summarizeExitEvents(events: ExitEventRow[]) {
	const summary: Record<BarItemType, number> = {
		plate: 0,
		glass: 0,
		bottle: 0,
		can: 0,
	};
	for (const event of events) {
		const type = eventType(event);
		summary[type] += 1;
	}
	return summary;
}

function eventType(event: ExitEventRow): BarItemType {
	const type = "type" in event ? event.type : event.itemType;
	if (type === "glass" || type === "bottle" || type === "can") return type;
	return "plate";
}

function eventTrackId(event: ExitEventRow) {
	return event.trackId;
}

function eventRowKey(event: ExitEventRow) {
	if ("id" in event) return `saved-${event.id}`;
	return `local-${event.trackId}-${event.time}`;
}

function eventDirection(event: ExitEventRow) {
	return event.direction;
}

function eventConfidence(event: ExitEventRow) {
	return "confidence" in event ? event.confidence : event.confidenceAvg;
}
