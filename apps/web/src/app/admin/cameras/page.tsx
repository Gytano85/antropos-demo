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
	type BarExitEvent,
	type BarItemType,
	type CountingDirection,
	type CountingLine,
	classifyBarCandidate,
	defaultCountingLine,
	itemLabel,
	normalizeLine,
	type ObjectCandidate,
	type ObjectTrack,
	updateObjectTracks,
} from "@/lib/cameras/bar-exit-engine";
import {
	AdaptiveMotionDetector,
	type MotionAnalysis,
	type MotionCalibrationState,
	type NormalizedRegion,
	regionAroundLine,
} from "@/lib/cameras/bar-motion-engine";
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

export default function CamerasPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const ipImageRef = useRef<HTMLImageElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const barModelCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const barModelBusyRef = useRef(false);
	const barMotionDetectorRef = useRef(new AdaptiveMotionDetector());
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
	const [drawingPoint, setDrawingPoint] = useState<"start" | "end" | null>(
		null,
	);
	const [barTracks, setBarTracks] = useState<ObjectTrack[]>([]);
	const barTracksRef = useRef<ObjectTrack[]>([]);
	const [barEvents, setBarEvents] = useState<BarExitEvent[]>([]);
	const [barDetectionCount, setBarDetectionCount] = useState(0);
	const [barMotionState, setBarMotionState] = useState<{
		state: MotionCalibrationState;
		progress: number;
		foregroundRatio: number;
		noiseLevel: number;
	}>({
		state: "uncalibrated",
		progress: 0,
		foregroundRatio: 0,
		noiseLevel: 0,
	});
	const lastBarModelAtRef = useRef(0);
	const lastBarModelResultAtRef = useRef(0);
	const barSessionIdRef = useRef(createVisionSessionId());
	const loadedBarConfigForRef = useRef<number | null>(null);
	const lastModelCandidatesRef = useRef<ObjectCandidate[]>([]);
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

	const stopCamera = useCallback(() => {
		for (const track of streamRef.current?.getTracks() ?? []) {
			track.stop();
		}
		const overlay = overlayCanvasRef.current;
		overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
		streamRef.current = null;
		barMotionDetectorRef.current.beginCalibration();
		setBarMotionState({
			state: "uncalibrated",
			progress: 0,
			foregroundRatio: 0,
			noiseLevel: 0,
		});
		setRunning(false);
	}, []);

	const beginBarCalibration = useCallback(() => {
		barMotionDetectorRef.current.beginCalibration();
		barTracksRef.current = [];
		lastModelCandidatesRef.current = [];
		lastBarModelAtRef.current = 0;
		lastBarModelResultAtRef.current = 0;
		barSessionIdRef.current = createVisionSessionId();
		setBarTracks([]);
		setBarDetectionCount(0);
		setBarMotionState({
			state: "calibrating",
			progress: 0,
			foregroundRatio: 0,
			noiseLevel: 0,
		});
		toast.info("Deja libre la zona de paso durante dos segundos.");
	}, []);

	const startCamera = async () => {
		if (!selected || startingCamera) return;
		setStartingCamera(true);
		setCameraError(null);
		if (draft.sourceType === "ip_camera") {
			if (!draft.streamUrl.trim()) {
				setCameraError("Agrega la URL HTTP/MJPEG/snapshot de la cámara IP.");
				setStartingCamera(false);
				return;
			}
			setRunning(true);
			void getObjectDetector().catch(() => undefined);
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
			void getObjectDetector().catch(() => undefined);
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
			tracks: ObjectTrack[] = [],
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
				const region = regionAroundLine(countingLine, countingDirection);
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
				context.strokeStyle = "#f59e0b";
				context.fillStyle = "#f59e0b";
				context.setLineDash([14, 10]);
				context.beginPath();
				context.moveTo(line.start.x, line.start.y);
				context.lineTo(line.end.x, line.end.y);
				context.stroke();
				context.setLineDash([]);
				context.beginPath();
				context.arc(line.start.x, line.start.y, 8, 0, Math.PI * 2);
				context.arc(line.end.x, line.end.y, 8, 0, Math.PI * 2);
				context.fill();
				context.fillStyle = "rgba(0,0,0,0.75)";
				context.fillRect(12, 12, 280, 30);
				context.fillStyle = "#fff";
				context.fillText(
					`Linea de salida: ${directionLabel(countingDirection)}`,
					22,
					34,
				);

				for (const track of tracks.filter((item) =>
					isConfirmedBarTrack(item, canvas.width),
				)) {
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
					const objectLabel =
						track.label === "motion-served-object"
							? "Objeto validado"
							: itemLabel(track.type);
					const label = `${objectLabel} ${track.id.replace("_", " #")} ${
						track.counted ? "contado" : ""
					}`;
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
			const motionResult = analyzeMovingServedObjects(
				canvas,
				motionCanvasRef,
				barMotionDetectorRef.current,
				regionAroundLine(countingLine, countingDirection),
			);
			setBarMotionState({
				state: motionResult.state,
				progress: motionResult.progress,
				foregroundRatio: motionResult.foregroundRatio,
				noiseLevel: motionResult.noiseLevel,
			});

			if (motionResult.state !== "ready") {
				setBarDetectionCount(0);
				drawDetections(canvas, [], barTracksRef.current);
				setDetection({
					configured: true,
					personCount: 0,
					confidenceAvg: null,
					message:
						motionResult.state === "unstable"
							? "La vista cambió demasiado. Recalibra con la zona vacía."
							: "Calibrando la zona de paso.",
				});
				return;
			}

			if (
				objectDetectorRef.current &&
				!barModelBusyRef.current &&
				now - lastBarModelAtRef.current > 1_250
			) {
				lastBarModelAtRef.current = now;
				if (!barModelCanvasRef.current) {
					barModelCanvasRef.current = document.createElement("canvas");
				}
				const modelCanvas = barModelCanvasRef.current;
				modelCanvas.width = Math.min(640, canvas.width);
				modelCanvas.height = Math.max(
					180,
					Math.round((canvas.height / canvas.width) * modelCanvas.width),
				);
				modelCanvas
					.getContext("2d")
					?.drawImage(canvas, 0, 0, modelCanvas.width, modelCanvas.height);
				const scaleX = canvas.width / modelCanvas.width;
				const scaleY = canvas.height / modelCanvas.height;
				barModelBusyRef.current = true;
				void objectDetectorRef.current
					.detect(modelCanvas, 30, 0.18)
					.then((predictions) => {
						lastModelCandidatesRef.current = predictions
							.map((prediction) =>
								classifyBarCandidate({
									class: prediction.class,
									score: prediction.score,
									bbox: [
										prediction.bbox[0] * scaleX,
										prediction.bbox[1] * scaleY,
										prediction.bbox[2] * scaleX,
										prediction.bbox[3] * scaleY,
									],
								}),
							)
							.filter((candidate): candidate is NonNullable<typeof candidate> =>
								Boolean(candidate && enabledBarItems[candidate.type]),
							);
						lastBarModelResultAtRef.current = Date.now();
					})
					.catch(() => {
						lastModelCandidatesRef.current = [];
					})
					.finally(() => {
						barModelBusyRef.current = false;
					});
			} else if (
				!objectDetectorRef.current &&
				detectorStatus !== "loading" &&
				detectorStatus !== "error"
			) {
				void getObjectDetector().catch(() => undefined);
			}

			const freshModelCandidates =
				now - lastBarModelResultAtRef.current <= 1_500
					? lastModelCandidatesRef.current
					: [];
			const candidates = mergeBarCandidates([
				...motionResult.candidates,
				...freshModelCandidates,
			]).filter((candidate) => enabledBarItems[candidate.type]);
			const minimumTravel = Math.max(24, canvas.width * 0.04);
			const tracked = updateObjectTracks(barTracksRef.current, candidates, {
				now,
				line: lineToCanvas(countingLine, canvas),
				direction: countingDirection,
				minHits: 5,
				maxMisses: 12,
				matchDistance: Math.max(canvas.width, canvas.height) * 0.2,
				lineTolerance: Math.max(7, canvas.width * 0.008),
				minTravelDistance: minimumTravel,
				gatePadding: Math.max(10, canvas.width * 0.025),
				idPrefix: barSessionIdRef.current,
			});
			barTracksRef.current = tracked.tracks;
			setBarTracks(tracked.tracks);
			const confirmedTracks = tracked.tracks.filter((track) =>
				isConfirmedBarTrack(track, canvas.width),
			);
			setBarDetectionCount(
				confirmedTracks.filter((track) => track.misses <= 1).length,
			);
			if (tracked.events.length > 0) {
				setBarEvents((current) => [...tracked.events, ...current].slice(0, 20));
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
			drawDetections(canvas, [], tracked.tracks);
			setDetection({
				configured: true,
				personCount: 0,
				confidenceAvg: null,
				message: "Zona calibrada y seguimiento de salida activo.",
			});
		},
		[
			countingDirection,
			countingLine,
			detectorStatus,
			drawDetections,
			draft.location,
			enabledBarItems,
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
	const exitSummary = summarizeExitEvents([...barEvents, ...savedExitEvents]);
	const confirmedBarTracks = barTracks.filter((track) =>
		isConfirmedBarTrack(track, canvasRef.current?.width ?? 1280),
	);

	useEffect(() => {
		const resetKey = `${mode}:${countingDirection}:${countingLine.start.x}:${countingLine.start.y}:${countingLine.end.x}:${countingLine.end.y}`;
		if (!resetKey) return;
		barTracksRef.current = [];
		setBarTracks([]);
	}, [mode, countingLine, countingDirection]);

	useEffect(() => {
		if (mode === "bar_exit" && running) beginBarCalibration();
	}, [mode, running, beginBarCalibration]);

	const updateLineFromPointer = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>, point: "start" | "end") => {
			const rect = event.currentTarget.getBoundingClientRect();
			const nextPoint = {
				x: (event.clientX - rect.left) / Math.max(1, rect.width),
				y: (event.clientY - rect.top) / Math.max(1, rect.height),
			};
			setCountingLine((current) =>
				normalizeLine({
					...current,
					[point]: nextPoint,
				}),
			);
		},
		[],
	);

	const handleOverlayPointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (mode !== "bar_exit") return;
			const rect = event.currentTarget.getBoundingClientRect();
			const point = {
				x: (event.clientX - rect.left) / Math.max(1, rect.width),
				y: (event.clientY - rect.top) / Math.max(1, rect.height),
			};
			const startDistance = Math.hypot(
				point.x - countingLine.start.x,
				point.y - countingLine.start.y,
			);
			const endDistance = Math.hypot(
				point.x - countingLine.end.x,
				point.y - countingLine.end.y,
			);
			const selectedPoint = startDistance <= endDistance ? "start" : "end";
			setDrawingPoint(selectedPoint);
			updateLineFromPointer(event, selectedPoint);
		},
		[countingLine, mode, updateLineFromPointer],
	);

	const handleOverlayPointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (mode !== "bar_exit" || !drawingPoint) return;
			updateLineFromPointer(event, drawingPoint);
		},
		[drawingPoint, mode, updateLineFromPointer],
	);

	const changeCountingDirection = useCallback(
		(direction: CountingDirection) => {
			setCountingDirection(direction);
			setCountingLine((current) => orientLineForDirection(current, direction));
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
							Detección local para presencia y conteo de salida de barra con
							línea configurable.
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
							? savedExitEvents.length + barEvents.length
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
								? "Conteo por línea de salida"
								: draft.sourceType === "ip_camera"
									? "Camara IP / stream"
									: "Webcam de prueba"}
						</CardTitle>
						<CardDescription>
							{mode === "bar_exit"
								? "Arrastra los puntos naranjas para colocar la línea. Solo se cuenta cuando el objeto cruza en la dirección configurada."
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
								onPointerUp={() => setDrawingPoint(null)}
								onPointerLeave={() => setDrawingPoint(null)}
								className={`absolute inset-0 h-full w-full ${
									mode === "bar_exit"
										? "cursor-crosshair touch-none"
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
							<Button
								variant="outline"
								onClick={detectOnce}
								disabled={!running || busy}
							>
								<RefreshCwIcon className="mr-2 h-4 w-4" />
								Analizar ahora
							</Button>
						</div>
						{mode === "bar_exit" ? (
							<BarExitPanel
								countingDirection={countingDirection}
								setCountingDirection={changeCountingDirection}
								enabledBarItems={enabledBarItems}
								setEnabledBarItems={setEnabledBarItems}
								barDetectionCount={barDetectionCount}
								barTracks={confirmedBarTracks}
								motionState={barMotionState}
								exitSummary={exitSummary}
								onCalibrate={beginBarCalibration}
								onReset={() => {
									beginBarCalibration();
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
								motionState={barMotionState}
								visibleObjects={barDetectionCount}
								activeTracks={confirmedBarTracks.length}
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
								? "Objetos contados al cruzar la línea de salida."
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
	barTracks,
	motionState,
	exitSummary,
	onCalibrate,
	onReset,
}: {
	countingDirection: CountingDirection;
	setCountingDirection: (direction: CountingDirection) => void;
	enabledBarItems: Record<BarItemType, boolean>;
	setEnabledBarItems: React.Dispatch<
		React.SetStateAction<Record<BarItemType, boolean>>
	>;
	barDetectionCount: number;
	barTracks: ObjectTrack[];
	motionState: {
		state: MotionCalibrationState;
		progress: number;
		foregroundRatio: number;
		noiseLevel: number;
	};
	exitSummary: Record<BarItemType, number>;
	onCalibrate: () => void;
	onReset: () => void;
}) {
	const directions: CountingDirection[] = [
		"left_to_right",
		"right_to_left",
		"top_to_bottom",
		"bottom_to_top",
	];
	const items: BarItemType[] = ["plate", "glass", "bottle", "can"];

	return (
		<div className="rounded-2xl border border-amber-300/40 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20">
			<div className="mb-4 flex flex-col gap-3 rounded-xl border bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<div
						className={`mt-1 h-2.5 w-2.5 rounded-full ${
							motionState.state === "ready"
								? "bg-emerald-500"
								: motionState.state === "unstable"
									? "bg-red-500"
									: "bg-amber-500"
						}`}
					/>
					<div>
						<div className="font-semibold">
							{motionState.state === "ready"
								? "Zona lista"
								: motionState.state === "unstable"
									? "La cámara se movió"
									: motionState.state === "calibrating"
										? `Calibrando ${Math.round(motionState.progress * 100)}%`
										: "Falta calibrar"}
						</div>
						<div className="text-muted-foreground text-xs">
							{motionState.state === "ready"
								? "La franja azul limita el área observada; la línea naranja registra la salida."
								: "Deja libre el área de paso durante dos segundos."}
						</div>
					</div>
				</div>
				<Button type="button" size="sm" variant="outline" onClick={onCalibrate}>
					<RefreshCwIcon className="mr-2 h-4 w-4" />
					Calibrar zona vacía
				</Button>
			</div>
			<div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
				<div>
					<div className="font-semibold text-base">Salida de barra</div>
					<div className="mt-1 text-muted-foreground text-xs">
						Cada objeto conserva su identificador aunque se oculte brevemente y
						solo se registra al completar el cruce.
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
					<div className="mt-3 grid gap-2 sm:grid-cols-2">
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
					<SmallStat label="visibles" value={barDetectionCount} />
					<SmallStat
						label="tracks activos"
						value={barTracks.filter((track) => track.misses === 0).length}
					/>
					<SmallStat label="platos" value={exitSummary.plate} />
					<SmallStat label="vasos/copas" value={exitSummary.glass} />
					<SmallStat label="botellas" value={exitSummary.bottle} />
					<SmallStat label="latas" value={exitSummary.can} />
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
							Enciende la cámara, ajusta la línea y cruza un objeto frente a la
							barra.
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
	motionState,
	visibleObjects,
	activeTracks,
}: {
	motionState: {
		state: MotionCalibrationState;
		progress: number;
		foregroundRatio: number;
		noiseLevel: number;
	};
	visibleObjects: number;
	activeTracks: number;
}) {
	if (motionState.state === "calibrating") {
		return (
			<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 text-sm dark:bg-amber-950/30 dark:text-amber-100">
				<div className="flex items-center gap-2 font-medium">
					<RefreshCwIcon className="h-4 w-4 animate-spin" />
					Calibrando la zona de paso ({Math.round(motionState.progress * 100)}%)
				</div>
				<div className="mt-1 text-xs opacity-80">
					No cruces objetos hasta que termine.
				</div>
			</div>
		);
	}

	if (motionState.state === "unstable") {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
				<AlertTriangleIcon className="mt-0.5 h-4 w-4" />
				<div>
					<div className="font-medium">La vista cambió demasiado</div>
					<div>Fija la cámara y pulsa “Calibrar zona vacía”.</div>
				</div>
			</div>
		);
	}

	if (motionState.state !== "ready") {
		return (
			<div className="rounded-xl border bg-muted p-3 text-muted-foreground text-sm">
				Enciende la cámara y calibra la zona antes de contar salidas.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50 p-3 text-emerald-950 text-sm sm:flex-row sm:items-center sm:justify-between dark:bg-emerald-950/25 dark:text-emerald-100">
			<div className="flex items-center gap-2 font-medium">
				<CheckCircle2Icon className="h-4 w-4" />
				Seguimiento activo
			</div>
			<div className="flex gap-4 text-xs">
				<span>{visibleObjects} objeto(s) visibles</span>
				<span>{activeTracks} seguimiento(s)</span>
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

function isConfirmedBarTrack(track: ObjectTrack, referenceWidth: number) {
	const netDisplacement = Math.hypot(
		track.center.x - track.firstCenter.x,
		track.center.y - track.firstCenter.y,
	);
	return (
		track.hits >= 5 &&
		track.misses <= 2 &&
		(track.counted || netDisplacement >= Math.max(12, referenceWidth * 0.012))
	);
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

function orientLineForDirection(
	line: CountingLine,
	direction: CountingDirection,
): CountingLine {
	const horizontalTravel =
		direction === "left_to_right" || direction === "right_to_left";
	const center = {
		x: (line.start.x + line.end.x) / 2,
		y: (line.start.y + line.end.y) / 2,
	};
	const currentLength = Math.hypot(
		line.end.x - line.start.x,
		line.end.y - line.start.y,
	);
	const length = Math.min(0.9, Math.max(0.35, currentLength));
	return normalizeLine(
		horizontalTravel
			? {
					start: { x: center.x, y: center.y - length / 2 },
					end: { x: center.x, y: center.y + length / 2 },
				}
			: {
					start: { x: center.x - length / 2, y: center.y },
					end: { x: center.x + length / 2, y: center.y },
				},
	);
}

function analyzeMovingServedObjects(
	source: HTMLCanvasElement,
	motionCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
	detector: AdaptiveMotionDetector,
	region: NormalizedRegion,
): MotionAnalysis {
	if (!motionCanvasRef.current) {
		motionCanvasRef.current = document.createElement("canvas");
	}
	const motionCanvas = motionCanvasRef.current;
	const width = 320;
	const height = Math.max(
		160,
		Math.round((source.height / source.width) * width),
	);
	if (motionCanvas.width !== width) motionCanvas.width = width;
	if (motionCanvas.height !== height) motionCanvas.height = height;
	const context = motionCanvas.getContext("2d", { willReadFrequently: true });
	if (!context) {
		return {
			state: detector.getState(),
			progress: 0,
			candidates: [],
			foregroundRatio: 0,
			noiseLevel: 0,
			componentCount: 0,
			region,
		};
	}
	context.drawImage(source, 0, 0, width, height);
	const frame = context.getImageData(0, 0, width, height);
	const analysis = detector.analyze(frame, region);
	const scaleX = source.width / width;
	const scaleY = source.height / height;
	return {
		...analysis,
		candidates: analysis.candidates.map((candidate) => ({
			...candidate,
			bbox: [
				candidate.bbox[0] * scaleX,
				candidate.bbox[1] * scaleY,
				candidate.bbox[2] * scaleX,
				candidate.bbox[3] * scaleY,
			],
		})),
	};
}

function mergeBarCandidates(candidates: ObjectCandidate[]) {
	const motionCandidates = candidates.filter(
		(candidate) => candidate.source === "motion",
	);
	const modelCandidates = candidates.filter(
		(candidate) => candidate.source === "model",
	);
	return motionCandidates
		.map((motionCandidate) => {
			const modelCandidate = modelCandidates
				.filter((candidate) =>
					candidateBoxesBelongTogether(motionCandidate, candidate),
				)
				.sort(
					(a, b) =>
						intersectionOverUnion(b.bbox, motionCandidate.bbox) -
						intersectionOverUnion(a.bbox, motionCandidate.bbox),
				)[0];
			if (!modelCandidate) return motionCandidate;
			return {
				...motionCandidate,
				type: modelCandidate.type,
				label: modelCandidate.label,
				confidence: Math.max(
					motionCandidate.confidence,
					modelCandidate.confidence,
				),
			};
		})
		.slice(0, 12);
}

function candidateBoxesBelongTogether(a: ObjectCandidate, b: ObjectCandidate) {
	const eitherIsMotion = a.source === "motion" || b.source === "motion";
	if (!eitherIsMotion && a.type !== b.type) return false;
	if (intersectionOverUnion(a.bbox, b.bbox) > (eitherIsMotion ? 0.16 : 0.35)) {
		return true;
	}
	const centerA = {
		x: a.bbox[0] + a.bbox[2] / 2,
		y: a.bbox[1] + a.bbox[3] / 2,
	};
	const centerB = {
		x: b.bbox[0] + b.bbox[2] / 2,
		y: b.bbox[1] + b.bbox[3] / 2,
	};
	const distance = Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
	const referenceSize = Math.max(
		12,
		Math.min(Math.max(a.bbox[2], a.bbox[3]), Math.max(b.bbox[2], b.bbox[3])),
	);
	return distance <= referenceSize * 0.42;
}

function intersectionOverUnion(
	a: [number, number, number, number],
	b: [number, number, number, number],
) {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[0] + a[2], b[0] + b[2]);
	const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const areaA = a[2] * a[3];
	const areaB = b[2] * b[3];
	return intersection / Math.max(1, areaA + areaB - intersection);
}

async function openCameraStream() {
	try {
		return await navigator.mediaDevices.getUserMedia({
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
			return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		}
		throw error;
	}
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
