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
	type BarModelDefinition,
	resolveAvailableBarModel,
} from "@/lib/cameras/bar-models";
import { candidatesFromCocoDetections } from "@/lib/cameras/bar-service-detector";
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
import {
	createBarDetector,
	type YoloClient,
} from "@/lib/cameras/yolo-onnx-client";
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

/** Cadencia del emparejamiento visual, independiente del dibujo. */
const VISUAL_TRACKING_INTERVAL_MS = 70;
type BarModelStatus = "idle" | "loading" | "ready" | "unsupported" | "error";
type BarModelRuntime = "webgpu" | "wasm";
type VisualTrackTemplate = {
	columns: number;
	rows: number;
	values: Uint8Array;
	bbox: BoundingBox;
	updatedAt: number;
};

export default function CamerasPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const ipImageRef = useRef<HTMLImageElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const barModelBusyRef = useRef(false);
	const barYoloSessionRef = useRef<YoloClient | null>(null);
	const barYoloSessionPromiseRef = useRef<Promise<YoloClient> | null>(null);
	const barModelDefinitionRef = useRef<BarModelDefinition | null>(null);
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
	const [countingBandPx, setCountingBandPx] = useState(42);
	const [barDebugVisible, setBarDebugVisible] = useState(false);
	const [barTracks, setBarTracks] = useState<BarTrack[]>([]);
	const barTracksRef = useRef<BarTrack[]>([]);
	const barVisualTemplatesRef = useRef(new Map<string, VisualTrackTemplate>());
	const [barCandidates, setBarCandidates] = useState<
		Array<{
			type: BarItemType;
			confidence: number;
			bbox: BoundingBox;
			label: string;
			seenAt?: number;
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
	const lastVisualAtRef = useRef(0);
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
					bandPx?: number;
					debug?: boolean;
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
				if (typeof saved.bandPx === "number") {
					setCountingBandPx(Math.max(18, Math.min(90, saved.bandPx)));
				}
				if (typeof saved.debug === "boolean") {
					setBarDebugVisible(saved.debug);
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
				bandPx: countingBandPx,
				debug: barDebugVisible,
			}),
		);
	}, [
		selectedCameraId,
		countingLine,
		countingDirection,
		enabledBarItems,
		countingBandPx,
		barDebugVisible,
	]);

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

	const getBarModelDetector = useCallback(async () => {
		if (barYoloSessionRef.current) return barYoloSessionRef.current;
		if (!barYoloSessionPromiseRef.current) {
			setBarModelStatus("loading");
			setBarModelProgress(0);
			barYoloSessionPromiseRef.current = (async () => {
				const definition = await resolveAvailableBarModel();
				setBarModelProgress(35);
				const session = await createBarDetector(definition, (backend) => {
					barModelRuntimeRef.current = backend;
					setBarModelRuntime(backend);
				});
				barYoloSessionRef.current = session;
				barModelDefinitionRef.current = definition;
				setBarModelProgress(100);
				setBarModelStatus("ready");
				return session;
			})().catch((error) => {
				barYoloSessionPromiseRef.current = null;
				barModelRuntimeRef.current = null;
				setBarModelRuntime(null);
				setBarModelStatus("error");
				throw error;
			});
		}
		return barYoloSessionPromiseRef.current;
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

	const resetBarTracking = useCallback(() => {
		barTracksRef.current = [];
		barCandidatesRef.current = [];
		barVisualTemplatesRef.current.clear();
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
						error instanceof Error
							? error.message
							: "No se pudo cargar el detector YOLO.",
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
			toast.success("Cámara IP activada.");
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
			toast.success("Cámara encendida.");
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
			_candidates: Array<{
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
				context.strokeStyle = "rgba(245, 158, 11, 0.2)";
				context.lineWidth = Math.max(countingBandPx, canvas.width * 0.018);
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

				for (const track of mergeVisibleDrinkTracks(
					tracks.filter(isDrawableBarTrack).map(projectTrackForDisplay),
				)) {
					const [x, y, width, height] = track.bbox;
					const state = visualTrackState(track);
					context.strokeStyle = trackStateColor(state);
					context.fillStyle = "rgba(0,0,0,0.72)";
					context.strokeRect(x, y, width, height);
					if (track.previousCenter) {
						context.beginPath();
						context.moveTo(track.previousCenter.x, track.previousCenter.y);
						context.lineTo(track.center.x, track.center.y);
						context.stroke();
					}
					const label = barDebugVisible
						? `${shortTrackId(track.id)} - ${state} - ${Math.round(
								track.confidence * 100,
							)}%`
						: `${businessItemLabel(track.type)} ${Math.round(
								track.confidence * 100,
							)}%${track.counted ? " - contado" : ""}`;
					const labelWidth = context.measureText(label).width + 12;
					const labelY = Math.max(0, y - 26);
					context.fillRect(x, labelY, labelWidth, 24);
					context.fillStyle = "#fff";
					context.fillText(label, x + 6, labelY + 17);
					if (barDebugVisible) {
						context.fillStyle = trackStateColor(state);
						context.beginPath();
						context.arc(track.center.x, track.center.y, 4, 0, Math.PI * 2);
						context.fill();
						const reason = trackDebugReason(track, line);
						const reasonWidth = context.measureText(reason).width + 12;
						context.fillStyle = "rgba(0,0,0,0.68)";
						context.fillRect(x, y + height + 4, reasonWidth, 22);
						context.fillStyle = "#fff";
						context.fillText(reason, x + 6, y + height + 20);
					}
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
		[barDebugVisible, countingBandPx, countingDirection, countingLine, mode],
	);

	const processBarExitFrame = useCallback(
		async (canvas: HTMLCanvasElement) => {
			if (!selected) return;
			const now = Date.now();
			// El emparejamiento visual compara plantillas de pixeles y es caro:
			// conserva su propia cadencia mientras el dibujo corre en cada frame,
			// que es lo que hace que se vea fluido.
			let visuallyTracked = barTracksRef.current;
			if (now - lastVisualAtRef.current >= VISUAL_TRACKING_INTERVAL_MS) {
				lastVisualAtRef.current = now;
				visuallyTracked = refineTracksWithVisualTemplates(
					canvas,
					barTracksRef.current,
					barVisualTemplatesRef.current,
					now,
				);
				const visualCrossing = markVisualCrossings(
					visuallyTracked,
					lineToCanvas(countingLine, canvas),
					countingDirection,
					Math.max(14, countingBandPx * 0.46),
					Math.max(12, countingBandPx * 0.75),
					now,
				);
				visuallyTracked = visualCrossing.tracks;
				if (
					visuallyTracked !== barTracksRef.current ||
					visualCrossing.events.length > 0
				) {
					barTracksRef.current = visuallyTracked;
					setBarTracks(visuallyTracked);
					setBarDetectionCount(
						mergeVisibleDrinkTracks(visuallyTracked.filter(isVisibleBarTrack))
							.length,
					);
					if (visualCrossing.events.length > 0) {
						setBarEvents((current) =>
							[...visualCrossing.events, ...current].slice(0, 20),
						);
						for (const event of visualCrossing.events) {
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
				}
			}
			drawDetections(canvas, [], visuallyTracked, barCandidatesRef.current);
			if (barModelStatus === "idle") {
				void getBarModelDetector().catch(() => undefined);
				return;
			}
			if (
				barModelStatus !== "ready" ||
				!barYoloSessionRef.current ||
				barModelBusyRef.current ||
				now - lastBarModelAtRef.current < 180
			) {
				return;
			}

			barModelBusyRef.current = true;
			lastBarModelAtRef.current = now;
			const inferenceStartedAt = performance.now();
			// El worker recibe el canvas completo y hace su propio letterbox:
			// el canvas intermedio solo anadia un redimensionado por frame.
			const crop = { x: 0, y: 0, width: canvas.width, height: canvas.height };
			const scaleX = 1;
			const scaleY = 1;
			const modelFrame = { width: canvas.width, height: canvas.height };
			// Deliberadamente sin await: si esta funcion esperara a la inferencia,
			// el bucle de dibujo quedaria bloqueado por `busyRef` mientras el
			// modelo trabaja y volveriamos a ver el overlay a saltos.
			const inference = barYoloSessionRef.current.detect(canvas, modelFrame);
			void (async () => {
				try {
					const raw = await inference;
					const baseCandidates = candidatesFromCocoDetections(raw, modelFrame);
					const drinksEnabled =
						enabledBarItems.glass ||
						enabledBarItems.bottle ||
						enabledBarItems.can;
					const candidates = dedupeBarCandidates(
						baseCandidates
							.filter((candidate) =>
								isDrinkItem(candidate.type)
									? drinksEnabled
									: enabledBarItems[candidate.type],
							)
							.map((candidate) => {
								const bbox: BoundingBox = [
									crop.x + candidate.bbox[0] * scaleX,
									crop.y + candidate.bbox[1] * scaleY,
									candidate.bbox[2] * scaleX,
									candidate.bbox[3] * scaleY,
								];
								return {
									...candidate,
									type: isDrinkItem(candidate.type) ? "glass" : candidate.type,
									label: isDrinkItem(candidate.type)
										? "bebida"
										: candidate.label,
									bbox,
									appearance: colorSignature(canvas, bbox),
									seenAt: Date.now(),
								};
							}),
					);
					const visibleCandidates =
						candidates.length > 0
							? candidates
							: barCandidatesRef.current.filter(
									(candidate) => Date.now() - (candidate.seenAt ?? 0) <= 1_800,
								);
					barCandidatesRef.current = visibleCandidates;
					setBarCandidates(visibleCandidates);
					setBarRawDetectionCount(candidates.length);
					const tracked = updateBarTracks(barTracksRef.current, candidates, {
						now: Date.now(),
						line: lineToCanvas(countingLine, canvas),
						direction: countingDirection,
						frameWidth: canvas.width,
						frameHeight: canvas.height,
						// Un track fantasma sobrevivia 4.5s sin ninguna deteccion y
						// quedaba dibujado encima del objeto real.
						minHits: 2,
						minConfirmMs: 200,
						maxMisses: 4,
						maxLostMs: 1_200,
						lineTolerance: Math.max(8, countingBandPx * 0.45),
						minTravelDistance: Math.max(16, countingBandPx * 0.48),
						gatePadding: Math.max(12, countingBandPx * 0.75),
						idPrefix: barSessionIdRef.current,
					});
					barTracksRef.current = tracked.tracks;
					refreshVisualTemplates(
						canvas,
						tracked.tracks,
						barVisualTemplatesRef.current,
						Date.now(),
					);
					setBarTracks(tracked.tracks);
					setBarDetectionCount(
						mergeVisibleDrinkTracks(tracked.tracks.filter(isVisibleBarTrack))
							.length,
					);
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
					drawDetections(canvas, [], tracked.tracks, visibleCandidates);
					setBarInferenceMs(Math.round(performance.now() - inferenceStartedAt));
					setDetection({
						configured: true,
						personCount: 0,
						confidenceAvg: null,
						message: "YOLO y seguimiento temporal activos.",
					});
				} catch (error) {
					setBarModelStatus("error");
					setCameraError(
						error instanceof Error
							? `Fallo YOLO: ${error.message}`
							: "Fallo el detector YOLO.",
					);
				} finally {
					barModelBusyRef.current = false;
				}
			})();
		},
		[
			barModelStatus,
			countingBandPx,
			countingDirection,
			countingLine,
			drawDetections,
			draft.location,
			enabledBarItems,
			getBarModelDetector,
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
							: "Detección local de personas activa.",
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
		let frame: number;

		if (mode === "bar_exit") {
			// El dibujo va a la cadencia de la pantalla y no espera al modelo: la
			// inferencia corre en su worker y actualiza los tracks cuando termina.
			// Antes cada vuelta esperaba a la inferencia, asi que el overlay se
			// redibujaba al ritmo del modelo y se veia a saltos.
			const render = () => {
				if (cancelled) return;
				void detectOnce();
				frame = requestAnimationFrame(render);
			};
			frame = requestAnimationFrame(render);
			return () => {
				cancelled = true;
				cancelAnimationFrame(frame);
			};
		}

		const loop = async () => {
			if (cancelled) return;
			await detectOnce();
			timeout = setTimeout(loop, 250);
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
	const sessionDrinkCount = drinkTotal(sessionExitSummary);
	const savedDrinkCount = drinkTotal(savedExitSummary);
	const visibleDrinkTracks = mergeVisibleDrinkTracks(
		confirmedBarTracks.filter((track) => isDrinkItem(track.type)),
	).length;
	const visibleDrinkCandidates = barCandidates.filter((candidate) =>
		isDrinkItem(candidate.type),
	).length;

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
			setCountingLine((current) =>
				moveLineToPoint(current, {
					x: (event.clientX - rect.left) / Math.max(1, rect.width),
					y: (event.clientY - rect.top) / Math.max(1, rect.height),
				}),
			);
		},
		[mode],
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
							<h1 className="font-bold text-2xl">Cámaras operativas</h1>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Detección local para presencia y conteo de pedidos al salir de la
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
						description="Cuenta bebidas al cruzar la zona definida."
						onClick={() => setMode("bar_exit")}
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Metric icon={CameraIcon} label="Cámaras" value={devices.length} />
				<Metric
					icon={mode === "bar_exit" ? PackageIcon : UsersIcon}
					label={mode === "bar_exit" ? "Bebidas contadas" : "Personas ahora"}
					value={
						mode === "bar_exit"
							? savedDrinkCount + sessionDrinkCount
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
					label={
						mode === "bar_exit" ? "Bebidas en pantalla" : "Última detección"
					}
					value={
						mode === "bar_exit"
							? visibleDrinkTracks || visibleDrinkCandidates
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
									? "Cámara IP / stream"
									: "Webcam de prueba"}
						</CardTitle>
						<CardDescription>
							{mode === "bar_exit"
								? "Arrastra la línea naranja al punto exacto de salida. La bebida se cuenta al completar el cruce."
								: "La webcam sirve para demo. Para cámara IP usa una URL HTTP/MJPEG o snapshot accesible desde la misma red."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative overflow-hidden rounded-2xl border bg-black">
							{draft.sourceType === "ip_camera" ? (
								// biome-ignore lint/performance/noImgElement: MJPEG camera streams require a native img element.
								<img
									ref={ipImageRef}
									src={running ? draft.streamUrl : undefined}
									alt="Vista de cámara IP"
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
										? "Conectar cámara IP"
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
								countingBandPx={countingBandPx}
								setCountingBandPx={setCountingBandPx}
								debugVisible={barDebugVisible}
								setDebugVisible={setBarDebugVisible}
								enabledBarItems={enabledBarItems}
								setEnabledBarItems={setEnabledBarItems}
								barDetectionCount={barDetectionCount}
								barRawDetectionCount={barRawDetectionCount}
								barTracks={confirmedBarTracks}
								visibleDrinkTracks={visibleDrinkTracks}
								visibleDrinkCandidates={visibleDrinkCandidates}
								modelStatus={barModelStatus}
								modelRuntime={barModelRuntime}
								inferenceMs={barInferenceMs}
								sessionExitCount={sessionExitCount}
								savedExitCount={savedExitCount}
								sessionDrinkCount={sessionDrinkCount}
								savedDrinkCount={savedDrinkCount}
								onCenterGate={() =>
									setCountingLine((current) =>
										moveLineToPoint(current, {
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
								visibleObjects={visibleDrinkTracks || visibleDrinkCandidates}
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
	countingBandPx,
	setCountingBandPx,
	debugVisible,
	setDebugVisible,
	enabledBarItems,
	setEnabledBarItems,
	barDetectionCount,
	barRawDetectionCount,
	barTracks,
	visibleDrinkTracks,
	visibleDrinkCandidates,
	modelStatus,
	modelRuntime,
	inferenceMs,
	sessionExitCount,
	savedExitCount,
	sessionDrinkCount,
	savedDrinkCount,
	onCenterGate,
	onReset,
}: {
	countingDirection: CountingDirection;
	setCountingDirection: (direction: CountingDirection) => void;
	countingBandPx: number;
	setCountingBandPx: React.Dispatch<React.SetStateAction<number>>;
	debugVisible: boolean;
	setDebugVisible: React.Dispatch<React.SetStateAction<boolean>>;
	enabledBarItems: Record<BarItemType, boolean>;
	setEnabledBarItems: React.Dispatch<
		React.SetStateAction<Record<BarItemType, boolean>>
	>;
	barDetectionCount: number;
	barRawDetectionCount: number;
	barTracks: BarTrack[];
	visibleDrinkTracks: number;
	visibleDrinkCandidates: number;
	modelStatus: BarModelStatus;
	modelRuntime: BarModelRuntime | null;
	inferenceMs: number | null;
	sessionExitCount: number;
	savedExitCount: number;
	sessionDrinkCount: number;
	savedDrinkCount: number;
	onCenterGate: () => void;
	onReset: () => void;
}) {
	const directions: CountingDirection[] = [
		"left_to_right",
		"right_to_left",
		"top_to_bottom",
		"bottom_to_top",
	];
	const ready = modelStatus === "ready";
	const drinksEnabled =
		enabledBarItems.glass || enabledBarItems.bottle || enabledBarItems.can;
	const toggleDrinks = () =>
		setEnabledBarItems((current) => ({
			...current,
			glass: !drinksEnabled,
			bottle: !drinksEnabled,
			can: !drinksEnabled,
		}));
	const visibleDrinks = visibleDrinkTracks || visibleDrinkCandidates;
	return (
		<div className="rounded-2xl border bg-background p-4 text-sm shadow-sm">
			<div className="mb-4 flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
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
								? modelRuntime === "wasm"
									? "Control de bebidas listo (compatible)"
									: "Control de bebidas listo"
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

			<div className="mb-5 grid gap-3 md:grid-cols-3">
				<div className="rounded-2xl border bg-primary/10 p-4">
					<div className="font-bold text-3xl">{sessionDrinkCount}</div>
					<div className="mt-1 text-muted-foreground text-xs">
						bebidas contadas en esta sesión
					</div>
				</div>
				<div className="rounded-2xl border bg-muted/30 p-4">
					<div className="font-bold text-3xl">{visibleDrinks}</div>
					<div className="mt-1 text-muted-foreground text-xs">
						bebidas visibles ahora
					</div>
				</div>
				<div className="rounded-2xl border bg-muted/30 p-4">
					<div className="font-bold text-3xl">{savedDrinkCount}</div>
					<div className="mt-1 text-muted-foreground text-xs">
						bebidas guardadas hoy
					</div>
				</div>
			</div>

			<div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
				<div>
					<div className="font-semibold text-base">Qué debe contar</div>
					<div className="mt-1 text-muted-foreground text-xs">
						Las propuestas débiles se descartan y un objeto necesita varias
						lecturas coherentes antes de aparecer.
					</div>
					<div className="mt-3 grid grid-cols-1 gap-2">
						<Button
							type="button"
							size="sm"
							variant={drinksEnabled ? "default" : "outline"}
							onClick={toggleDrinks}
						>
							Bebidas
						</Button>
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
					<div className="mt-5 space-y-2">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="font-semibold text-base">Banda de conteo</div>
								<div className="text-muted-foreground text-xs">
									Más ancha tolera pases rápidos y diagonales.
								</div>
							</div>
							<div className="font-semibold">{countingBandPx}px</div>
						</div>
						<Input
							type="range"
							min={18}
							max={90}
							value={countingBandPx}
							onChange={(event) =>
								setCountingBandPx(Number(event.currentTarget.value))
							}
						/>
					</div>
					<Button
						type="button"
						variant={debugVisible ? "default" : "outline"}
						size="sm"
						className="mt-4 w-full"
						onClick={() => setDebugVisible((current) => !current)}
					>
						{debugVisible ? "Ocultar debug visual" : "Mostrar debug visual"}
					</Button>
				</div>

				<div className="grid grid-cols-2 gap-2 text-center text-xs">
					<SmallStat label="bebidas contadas" value={sessionDrinkCount} />
					<SmallStat label="bebidas en pantalla" value={visibleDrinks} />
					<SmallStat
						label="candidatos del modelo"
						value={barRawDetectionCount}
					/>
					<SmallStat label="objetos unidos" value={barDetectionCount} />
					<SmallStat
						label="tiempo por lectura"
						value={inferenceMs === null ? "—" : `${inferenceMs} ms`}
					/>
					<SmallStat
						label="seguimientos activos"
						value={barTracks.filter((track) => track.misses === 0).length}
					/>
					<SmallStat label="cruces sesión" value={sessionExitCount} />
					<SmallStat label="bebidas hoy" value={savedDrinkCount} />
					<SmallStat label="cruces hoy" value={savedExitCount} />
					<div className="col-span-2 rounded-xl border bg-background px-3 py-2 text-left">
						<div className="mt-1 text-muted-foreground">
							Conteo consolidado por bebida.
						</div>
					</div>
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
								<Badge variant="outline">{businessItemLabel(type)}</Badge>
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
							: "YOLO no pudo iniciar. Revisa que el modelo y runtime ONNX esten disponibles en /models y /ort."}
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
					Preparando YOLO ({modelProgress}%)
				</div>
				<div className="mt-1 text-xs opacity-80">
					Cargando modelo local para detectar bebidas en la barra.
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
				{modelRuntime === "wasm"
					? "Detector activo en modo compatible"
					: "Detector activo"}
			</div>
			<div className="flex flex-wrap gap-4 text-xs">
				<span>{visibleObjects} bebida(s) en pantalla</span>
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
				Aún no hay lectura. Enciende la cámara y espera a que el detector local
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
	const age = Date.now() - track.lastSeenAt;
	return track.state === "confirmed" && track.misses <= 8 && age <= 900;
}

function isDrawableBarTrack(track: BarTrack) {
	const age = Date.now() - track.lastSeenAt;
	if (track.counted) return age <= 420;
	return (
		track.misses <= 8 &&
		age <= 760 &&
		(track.state === "confirmed" || track.hits >= 1)
	);
}

function projectTrackForDisplay(track: BarTrack): BarTrack {
	const elapsed = Math.min(260, Math.max(0, Date.now() - track.lastSeenAt));
	const dx = track.velocity.x * elapsed;
	const dy = track.velocity.y * elapsed;
	if (Math.abs(dx) + Math.abs(dy) < 0.5) return track;
	return {
		...track,
		bbox: [
			track.bbox[0] + dx,
			track.bbox[1] + dy,
			track.bbox[2],
			track.bbox[3],
		],
		center: {
			x: track.center.x + dx,
			y: track.center.y + dy,
		},
	};
}

function markVisualCrossings(
	tracks: BarTrack[],
	line: CountingLine,
	direction: CountingDirection,
	minTravelDistance: number,
	gatePadding: number,
	now: number,
) {
	let changed = false;
	const events: BarExitEvent[] = [];
	const nextTracks = tracks.map((track) => {
		if (
			track.counted ||
			!isDrinkItem(track.type) ||
			!canVisualCountTrack(track) ||
			!track.previousCenter
		) {
			return track;
		}
		const previous = track.previousCenter;
		const current = track.center;
		const previousSide =
			track.lastSide !== 0
				? track.lastSide
				: visualStableSide(previous, line, 6);
		const currentSide = visualStableSide(current, line, 6);
		if (
			previousSide === 0 ||
			currentSide === 0 ||
			previousSide === currentSide
		) {
			return {
				...track,
				lastSide: currentSide === 0 ? track.lastSide : currentSide,
				lastStableCenter: currentSide === 0 ? track.lastStableCenter : current,
			};
		}
		const directionalTravel = visualMovementInDirection(
			track.firstCenter,
			current,
			direction,
		);
		const stepTravel = visualMovementInDirection(previous, current, direction);
		const crossed =
			directionalTravel >= minTravelDistance &&
			stepTravel > 0 &&
			visualCrossesFiniteLine(previous, current, line, gatePadding);
		if (!crossed) {
			// currentSide ya no puede ser 0: el early return de arriba lo descarta.
			if (
				track.lastSide !== currentSide ||
				track.lastStableCenter?.x !== current.x ||
				track.lastStableCenter?.y !== current.y
			) {
				changed = true;
				return {
					...track,
					lastSide: currentSide,
					lastStableCenter: current,
				};
			}
			return track;
		}
		changed = true;
		const countedTrack = {
			...track,
			counted: true,
			lastSide: currentSide,
			lastStableCenter: current,
		};
		events.push({
			trackId: track.id,
			type: track.type,
			confidence: track.confidence,
			direction,
			time: now,
			crossingPoint: visualLineIntersection(previous, current, line),
		});
		return countedTrack;
	});
	return { tracks: changed ? nextTracks : tracks, events };
}

function canVisualCountTrack(track: BarTrack) {
	return (
		track.state === "confirmed" || (track.hits >= 1 && track.confidence >= 0.2)
	);
}

type VisualTrackState =
	| "nuevo"
	| "siguiendo"
	| "cerca-linea"
	| "contado"
	| "perdido";

function visualTrackState(track: BarTrack): VisualTrackState {
	const age = Date.now() - track.lastSeenAt;
	if (track.counted) return "contado";
	if (track.misses > 0 || age > 260) return "perdido";
	if (track.state !== "confirmed") return "nuevo";
	if (track.lastSide === 0) return "cerca-linea";
	return "siguiendo";
}

function trackStateColor(state: VisualTrackState) {
	if (state === "contado") return "#22c55e";
	if (state === "perdido") return "#ef4444";
	if (state === "cerca-linea") return "#f59e0b";
	if (state === "nuevo") return "#a78bfa";
	return "#38bdf8";
}

function shortTrackId(id: string) {
	return id.split("-").slice(-2).join("-");
}

function trackDebugReason(track: BarTrack, line: CountingLine) {
	if (track.counted) return "contada";
	if (track.misses > 0) return `perdida ${track.misses}`;
	if (track.state !== "confirmed") return `nueva h${track.hits}`;
	if (!track.previousCenter) return "sin trayectoria";
	const side = visualStableSide(track.center, line, 6);
	if (side === 0) return "dentro de banda";
	if (track.lastSide === side) return "mismo lado";
	return "lista para cruce";
}

function refineTracksWithVisualTemplates(
	canvas: HTMLCanvasElement,
	tracks: BarTrack[],
	templates: Map<string, VisualTrackTemplate>,
	now: number,
) {
	if (tracks.length === 0 || templates.size === 0) return tracks;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return tracks;
	const frame = context.getImageData(0, 0, canvas.width, canvas.height);
	let changed = false;
	const refined = tracks.map((track) => {
		if (!isDrawableBarTrack(track) || !isDrinkItem(track.type)) return track;
		const template = templates.get(track.id);
		if (!template) return track;
		const match = findVisualTemplateMatch(frame, track, template, now);
		if (!match || match.score > 38) return track;
		const previousCenter = track.center;
		const center = {
			x: match.bbox[0] + match.bbox[2] / 2,
			y: match.bbox[1] + match.bbox[3] / 2,
		};
		const elapsed = Math.max(1, now - track.lastSeenAt);
		changed = true;
		return {
			...track,
			bbox: match.bbox,
			previousCenter,
			center,
			velocity: {
				x: smoothNumber(
					track.velocity.x,
					(center.x - previousCenter.x) / elapsed,
					0.34,
				),
				y: smoothNumber(
					track.velocity.y,
					(center.y - previousCenter.y) / elapsed,
					0.34,
				),
			},
			lastSeenAt: now,
			misses: Math.max(0, track.misses - 1),
		};
	});
	return changed ? refined : tracks;
}

function refreshVisualTemplates(
	canvas: HTMLCanvasElement,
	tracks: BarTrack[],
	templates: Map<string, VisualTrackTemplate>,
	now: number,
) {
	const liveIds = new Set(tracks.map((track) => track.id));
	for (const id of templates.keys()) {
		if (!liveIds.has(id)) templates.delete(id);
	}
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return;
	const frame = context.getImageData(0, 0, canvas.width, canvas.height);
	for (const track of tracks) {
		if (!isDrawableBarTrack(track) || !isDrinkItem(track.type)) continue;
		const template = captureVisualTemplate(frame, track.bbox, now);
		if (template) templates.set(track.id, template);
	}
}

function captureVisualTemplate(
	frame: ImageData,
	bbox: BoundingBox,
	now: number,
): VisualTrackTemplate | null {
	const safe = clampBox(bbox, frame.width, frame.height);
	if (!safe || safe[2] < 8 || safe[3] < 8) return null;
	const columns = 12;
	const rows = 12;
	const values = new Uint8Array(columns * rows);
	let sum = 0;
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const x = Math.round(safe[0] + ((column + 0.5) / columns) * safe[2]);
			const y = Math.round(safe[1] + ((row + 0.5) / rows) * safe[3]);
			const value = frameGrayAt(frame, x, y);
			values[row * columns + column] = value;
			sum += value;
		}
	}
	const mean = sum / values.length;
	const variance =
		values.reduce((total, value) => total + (value - mean) ** 2, 0) /
		values.length;
	if (Math.sqrt(variance) < 5) return null;
	return { columns, rows, values, bbox: safe, updatedAt: now };
}

function findVisualTemplateMatch(
	frame: ImageData,
	track: BarTrack,
	template: VisualTrackTemplate,
	now: number,
) {
	const elapsed = Math.min(320, Math.max(0, now - track.lastSeenAt));
	const predicted: BoundingBox = [
		track.bbox[0] + track.velocity.x * elapsed,
		track.bbox[1] + track.velocity.y * elapsed,
		track.bbox[2],
		track.bbox[3],
	];
	const searchRadius = Math.max(
		18,
		Math.min(64, Math.max(track.bbox[2], track.bbox[3]) * 0.55),
	);
	const step = Math.max(
		4,
		Math.round(Math.max(track.bbox[2], track.bbox[3]) / 12),
	);
	let best: { bbox: BoundingBox; score: number } | null = null;
	for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
		for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
			const candidate = clampBox(
				[predicted[0] + dx, predicted[1] + dy, predicted[2], predicted[3]],
				frame.width,
				frame.height,
			);
			if (!candidate) continue;
			const score = visualTemplateScore(frame, candidate, template);
			const centerPenalty =
				(Math.hypot(dx, dy) / Math.max(1, searchRadius)) * 2.5;
			const finalScore = score + centerPenalty;
			if (!best || finalScore < best.score) {
				best = { bbox: candidate, score: finalScore };
			}
		}
	}
	return best;
}

function visualTemplateScore(
	frame: ImageData,
	bbox: BoundingBox,
	template: VisualTrackTemplate,
) {
	let total = 0;
	for (let row = 0; row < template.rows; row += 1) {
		for (let column = 0; column < template.columns; column += 1) {
			const x = Math.round(
				bbox[0] + ((column + 0.5) / template.columns) * bbox[2],
			);
			const y = Math.round(bbox[1] + ((row + 0.5) / template.rows) * bbox[3]);
			const expected = template.values[row * template.columns + column] ?? 0;
			total += Math.abs(frameGrayAt(frame, x, y) - expected);
		}
	}
	return total / template.values.length;
}

function frameGrayAt(frame: ImageData, x: number, y: number) {
	const safeX = Math.max(0, Math.min(frame.width - 1, x));
	const safeY = Math.max(0, Math.min(frame.height - 1, y));
	const index = (safeY * frame.width + safeX) * 4;
	return Math.round(
		(frame.data[index] ?? 0) * 0.299 +
			(frame.data[index + 1] ?? 0) * 0.587 +
			(frame.data[index + 2] ?? 0) * 0.114,
	);
}

function clampBox(
	bbox: BoundingBox,
	frameWidth: number,
	frameHeight: number,
): BoundingBox | null {
	const width = Math.max(1, Math.min(bbox[2], frameWidth));
	const height = Math.max(1, Math.min(bbox[3], frameHeight));
	const x = Math.max(0, Math.min(frameWidth - width, bbox[0]));
	const y = Math.max(0, Math.min(frameHeight - height, bbox[1]));
	if (![x, y, width, height].every(Number.isFinite)) return null;
	return [x, y, width, height];
}

function smoothNumber(current: number, next: number, alpha: number) {
	return current * (1 - alpha) + next * alpha;
}

function visualStableSide(
	point: { x: number; y: number },
	line: CountingLine,
	tolerance: number,
): -1 | 0 | 1 {
	const distance = visualSignedDistanceToLine(point, line);
	if (Math.abs(distance) <= tolerance) return 0;
	return distance > 0 ? 1 : -1;
}

function visualSignedDistanceToLine(
	point: { x: number; y: number },
	line: CountingLine,
) {
	const dx = line.end.x - line.start.x;
	const dy = line.end.y - line.start.y;
	const length = Math.hypot(dx, dy);
	if (length < 1e-6) return 0;
	return (
		(dx * (point.y - line.start.y) - dy * (point.x - line.start.x)) / length
	);
}

function visualMovementInDirection(
	start: { x: number; y: number },
	end: { x: number; y: number },
	direction: CountingDirection,
) {
	if (direction === "left_to_right") return end.x - start.x;
	if (direction === "right_to_left") return start.x - end.x;
	if (direction === "top_to_bottom") return end.y - start.y;
	return start.y - end.y;
}

function visualCrossesFiniteLine(
	previous: { x: number; y: number },
	current: { x: number; y: number },
	line: CountingLine,
	padding: number,
) {
	const intersection = visualSegmentIntersection(previous, current, line);
	if (!intersection) return false;
	const lineLength = Math.hypot(
		line.end.x - line.start.x,
		line.end.y - line.start.y,
	);
	const normalizedPadding = padding / Math.max(1e-6, lineLength);
	return (
		intersection.pathT >= 0 &&
		intersection.pathT <= 1 &&
		intersection.lineT >= -normalizedPadding &&
		intersection.lineT <= 1 + normalizedPadding
	);
}

function visualLineIntersection(
	previous: { x: number; y: number },
	current: { x: number; y: number },
	line: CountingLine,
) {
	const intersection = visualSegmentIntersection(previous, current, line);
	const pathT = intersection?.pathT ?? 0.5;
	return {
		x: previous.x + (current.x - previous.x) * pathT,
		y: previous.y + (current.y - previous.y) * pathT,
	};
}

function visualSegmentIntersection(
	pathStart: { x: number; y: number },
	pathEnd: { x: number; y: number },
	line: CountingLine,
) {
	const rx = pathEnd.x - pathStart.x;
	const ry = pathEnd.y - pathStart.y;
	const sx = line.end.x - line.start.x;
	const sy = line.end.y - line.start.y;
	const denominator = rx * sy - ry * sx;
	if (Math.abs(denominator) < 1e-8) return null;
	const qpx = line.start.x - pathStart.x;
	const qpy = line.start.y - pathStart.y;
	return {
		pathT: (qpx * sy - qpy * sx) / denominator,
		lineT: (qpx * ry - qpy * rx) / denominator,
	};
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

function moveLineToPoint(line: CountingLine, point: { x: number; y: number }) {
	const normalized = normalizeLine(line);
	const dx = normalized.end.x - normalized.start.x;
	const dy = normalized.end.y - normalized.start.y;
	const halfX = dx / 2;
	const halfY = dy / 2;
	const maxOffsetX = Math.max(Math.abs(halfX), 0.001);
	const maxOffsetY = Math.max(Math.abs(halfY), 0.001);
	const center = {
		x: Math.max(maxOffsetX, Math.min(1 - maxOffsetX, point.x)),
		y: Math.max(maxOffsetY, Math.min(1 - maxOffsetY, point.y)),
	};
	return normalizeLine({
		start: { x: center.x - halfX, y: center.y - halfY },
		end: { x: center.x + halfX, y: center.y + halfY },
	});
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

function barModelStatusLabel(
	status: BarModelStatus,
	progress: number,
	runtime?: BarModelRuntime | null,
) {
	if (status === "ready")
		return runtime === "wasm"
			? "Detector listo (compatible)"
			: "Detector listo";
	if (status === "loading") return `Preparando YOLO ${progress}%`;
	if (status === "unsupported") return "Detector no disponible";
	if (status === "error") return "Detector con error";
	return "YOLO";
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

function drinkTotal(summary: Record<BarItemType, number>) {
	return summary.glass + summary.bottle + summary.can;
}

function isDrinkItem(type: BarItemType) {
	return type === "glass" || type === "bottle" || type === "can";
}

function businessItemLabel(type: BarItemType) {
	return isDrinkItem(type) ? "Bebida" : itemLabel(type);
}

type BarCandidateForDisplay = {
	type: BarItemType;
	confidence: number;
	bbox: BoundingBox;
	label: string;
	support: number;
	appearance?: number[];
	seenAt?: number;
};

function dedupeBarCandidates<T extends BarCandidateForDisplay>(
	candidates: T[],
) {
	const kept: T[] = [];
	for (const candidate of candidates.sort(
		(a, b) => b.confidence - a.confidence,
	)) {
		const duplicate = kept.some((current) =>
			isSameDrinkCandidate(current, candidate),
		);
		if (!duplicate) kept.push(candidate);
	}
	return kept;
}

function isSameDrinkCandidate(
	a: BarCandidateForDisplay,
	b: BarCandidateForDisplay,
) {
	if (!isDrinkItem(a.type) || !isDrinkItem(b.type)) return false;
	const overlap = boxIntersectionOverSmaller(a.bbox, b.bbox);
	if (overlap >= 0.2) return true;
	const distance = Math.hypot(
		a.bbox[0] + a.bbox[2] / 2 - (b.bbox[0] + b.bbox[2] / 2),
		a.bbox[1] + a.bbox[3] / 2 - (b.bbox[1] + b.bbox[3] / 2),
	);
	const size = Math.max(a.bbox[2], a.bbox[3], b.bbox[2], b.bbox[3], 1);
	const similarSize =
		Math.min(a.bbox[2] * a.bbox[3], b.bbox[2] * b.bbox[3]) /
			Math.max(a.bbox[2] * a.bbox[3], b.bbox[2] * b.bbox[3], 1) >
		0.42;
	return similarSize && distance / size <= 0.46;
}

function mergeVisibleDrinkTracks(tracks: BarTrack[]) {
	const kept: BarTrack[] = [];
	for (const track of tracks) {
		if (!isDrinkItem(track.type)) {
			kept.push(track);
			continue;
		}
		const duplicateIndex = kept.findIndex(
			(current) =>
				isDrinkItem(current.type) && areSameDisplayedDrink(current, track),
		);
		if (duplicateIndex === -1) {
			kept.push(track);
			continue;
		}
		const current = kept[duplicateIndex];
		if (!current || track.confidence <= current.confidence) continue;
		kept[duplicateIndex] = {
			...track,
			counted: current.counted || track.counted,
		};
	}
	return kept;
}

function areSameDisplayedDrink(a: BarTrack, b: BarTrack) {
	const overlap = boxIntersectionOverSmaller(a.bbox, b.bbox);
	if (overlap >= 0.22) return true;
	const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
	const size = Math.max(a.bbox[2], a.bbox[3], b.bbox[2], b.bbox[3], 1);
	const areaA = a.bbox[2] * a.bbox[3];
	const areaB = b.bbox[2] * b.bbox[3];
	const similarSize = Math.min(areaA, areaB) / Math.max(areaA, areaB, 1) > 0.42;
	return similarSize && distance / size <= 0.46;
}

function boxIntersectionOverSmaller(a: BoundingBox, b: BoundingBox) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const areaA = Math.max(0, a[2]) * Math.max(0, a[3]);
	const areaB = Math.max(0, b[2]) * Math.max(0, b[3]);
	return intersection / Math.max(1, Math.min(areaA, areaB));
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
