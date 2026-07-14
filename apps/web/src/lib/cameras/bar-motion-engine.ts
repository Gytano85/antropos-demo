import type {
	CountingDirection,
	CountingLine,
	ObjectCandidate,
} from "./bar-exit-engine";

export type PixelFrame = {
	width: number;
	height: number;
	data: Uint8ClampedArray;
};

export type NormalizedRegion = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type MotionCalibrationState =
	| "uncalibrated"
	| "calibrating"
	| "ready"
	| "unstable";

export type MotionAnalysis = {
	state: MotionCalibrationState;
	progress: number;
	candidates: ObjectCandidate[];
	foregroundRatio: number;
	noiseLevel: number;
	componentCount: number;
	region: NormalizedRegion;
};

export type AdaptiveMotionOptions = {
	calibrationFrames?: number;
	thresholdFloor?: number;
	minAreaRatio?: number;
	maxAreaRatio?: number;
	backgroundLearningRate?: number;
};

const DEFAULT_OPTIONS = {
	calibrationFrames: 14,
	thresholdFloor: 22,
	minAreaRatio: 0.0016,
	maxAreaRatio: 0.24,
	backgroundLearningRate: 0.012,
};

export class AdaptiveMotionDetector {
	private readonly options: typeof DEFAULT_OPTIONS;
	private width = 0;
	private height = 0;
	private calibrationSeen = 0;
	private calibrationSum: Float32Array | null = null;
	private calibrationLumaSq: Float32Array | null = null;
	private background: Float32Array | null = null;
	private noiseMap: Float32Array | null = null;
	private noiseLevel = 0;
	private unstableFrames = 0;
	private state: MotionCalibrationState = "uncalibrated";

	constructor(options: AdaptiveMotionOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	beginCalibration() {
		this.calibrationSeen = 0;
		this.calibrationSum = null;
		this.calibrationLumaSq = null;
		this.background = null;
		this.noiseMap = null;
		this.noiseLevel = 0;
		this.unstableFrames = 0;
		this.state = "calibrating";
	}

	reset() {
		this.width = 0;
		this.height = 0;
		this.state = "uncalibrated";
		this.beginCalibration();
	}

	getState() {
		return this.state;
	}

	analyze(
		frame: PixelFrame,
		region: NormalizedRegion = fullRegion(),
	): MotionAnalysis {
		validateFrame(frame);
		const safeRegion = normalizeRegion(region);
		if (frame.width !== this.width || frame.height !== this.height) {
			this.width = frame.width;
			this.height = frame.height;
			this.beginCalibration();
		}

		if (this.state === "uncalibrated") this.beginCalibration();
		if (this.state === "calibrating") {
			this.addCalibrationFrame(frame);
			return this.emptyAnalysis(safeRegion);
		}

		const background = this.background;
		const noiseMap = this.noiseMap;
		if (!background || !noiseMap) {
			this.beginCalibration();
			return this.emptyAnalysis(safeRegion);
		}

		const bounds = regionBounds(safeRegion, frame.width, frame.height);
		const mask = new Uint8Array(frame.width * frame.height);
		let foregroundPixels = 0;
		let regionPixels = 0;

		for (let y = bounds.top; y < bounds.bottom; y++) {
			for (let x = bounds.left; x < bounds.right; x++) {
				const pixel = y * frame.width + x;
				const dataIndex = pixel * 4;
				const backgroundIndex = pixel * 3;
				const r = frame.data[dataIndex] ?? 0;
				const g = frame.data[dataIndex + 1] ?? 0;
				const b = frame.data[dataIndex + 2] ?? 0;
				const br = background[backgroundIndex] ?? 0;
				const bg = background[backgroundIndex + 1] ?? 0;
				const bb = background[backgroundIndex + 2] ?? 0;
				const currentLuma = luma(r, g, b);
				const backgroundLuma = luma(br, bg, bb);
				const maximumChannelDifference = Math.max(
					Math.abs(r - br),
					Math.abs(g - bg),
					Math.abs(b - bb),
				);
				const difference =
					maximumChannelDifference * 0.58 +
					Math.abs(currentLuma - backgroundLuma) * 0.42;
				const threshold =
					this.options.thresholdFloor + Math.min(24, noiseMap[pixel] * 3.25);
				const foreground =
					difference > threshold &&
					!looksLikeShadow(r, g, b, br, bg, bb, currentLuma, backgroundLuma);
				regionPixels += 1;
				if (foreground) {
					mask[pixel] = 1;
					foregroundPixels += 1;
				}

				const learningRate = foreground
					? this.options.backgroundLearningRate * 0.025
					: this.options.backgroundLearningRate;
				background[backgroundIndex] = blend(br, r, learningRate);
				background[backgroundIndex + 1] = blend(bg, g, learningRate);
				background[backgroundIndex + 2] = blend(bb, b, learningRate);
			}
		}

		const foregroundRatio = foregroundPixels / Math.max(1, regionPixels);
		if (foregroundRatio > 0.38) {
			this.unstableFrames += 1;
		} else {
			this.unstableFrames = Math.max(0, this.unstableFrames - 1);
		}
		if (this.unstableFrames >= 4) this.state = "unstable";
		if (this.state === "unstable" && foregroundRatio < 0.08) {
			this.unstableFrames = Math.max(0, this.unstableFrames - 2);
			if (this.unstableFrames === 0) this.state = "ready";
		}

		if (this.state === "unstable") {
			return {
				state: this.state,
				progress: 1,
				candidates: [],
				foregroundRatio,
				noiseLevel: this.noiseLevel,
				componentCount: 0,
				region: safeRegion,
			};
		}

		const cleanedMask = cleanBinaryMask(
			mask,
			frame.width,
			frame.height,
			bounds,
		);
		const components = connectedComponents(cleanedMask, frame.width, bounds);
		const candidates = components
			.map((component) => componentToCandidate(component, bounds, this.options))
			.filter((candidate): candidate is ObjectCandidate => Boolean(candidate))
			.slice(0, 10);

		return {
			state: this.state,
			progress: 1,
			candidates,
			foregroundRatio,
			noiseLevel: this.noiseLevel,
			componentCount: components.length,
			region: safeRegion,
		};
	}

	private addCalibrationFrame(frame: PixelFrame) {
		const pixelCount = frame.width * frame.height;
		if (!this.calibrationSum) {
			this.calibrationSum = new Float32Array(pixelCount * 3);
			this.calibrationLumaSq = new Float32Array(pixelCount);
		}
		const sum = this.calibrationSum;
		const lumaSq = this.calibrationLumaSq;
		if (!sum || !lumaSq) return;

		for (let pixel = 0; pixel < pixelCount; pixel++) {
			const sourceIndex = pixel * 4;
			const targetIndex = pixel * 3;
			const r = frame.data[sourceIndex] ?? 0;
			const g = frame.data[sourceIndex + 1] ?? 0;
			const b = frame.data[sourceIndex + 2] ?? 0;
			sum[targetIndex] += r;
			sum[targetIndex + 1] += g;
			sum[targetIndex + 2] += b;
			const value = luma(r, g, b);
			lumaSq[pixel] += value * value;
		}
		this.calibrationSeen += 1;
		if (this.calibrationSeen < this.options.calibrationFrames) return;

		this.background = new Float32Array(pixelCount * 3);
		this.noiseMap = new Float32Array(pixelCount);
		let totalNoise = 0;
		for (let pixel = 0; pixel < pixelCount; pixel++) {
			const targetIndex = pixel * 3;
			const r = sum[targetIndex] / this.calibrationSeen;
			const g = sum[targetIndex + 1] / this.calibrationSeen;
			const b = sum[targetIndex + 2] / this.calibrationSeen;
			this.background[targetIndex] = r;
			this.background[targetIndex + 1] = g;
			this.background[targetIndex + 2] = b;
			const meanLuma = luma(r, g, b);
			const variance = Math.max(
				0,
				lumaSq[pixel] / this.calibrationSeen - meanLuma * meanLuma,
			);
			const noise = Math.sqrt(variance);
			this.noiseMap[pixel] = noise;
			totalNoise += noise;
		}
		this.noiseLevel = totalNoise / Math.max(1, pixelCount);
		this.calibrationSum = null;
		this.calibrationLumaSq = null;
		this.state = "ready";
	}

	private emptyAnalysis(region: NormalizedRegion): MotionAnalysis {
		return {
			state: this.state,
			progress:
				this.state === "calibrating"
					? Math.min(1, this.calibrationSeen / this.options.calibrationFrames)
					: 0,
			candidates: [],
			foregroundRatio: 0,
			noiseLevel: this.noiseLevel,
			componentCount: 0,
			region,
		};
	}
}

export function regionAroundLine(
	line: CountingLine,
	direction: CountingDirection,
): NormalizedRegion {
	const minX = Math.min(line.start.x, line.end.x);
	const maxX = Math.max(line.start.x, line.end.x);
	const minY = Math.min(line.start.y, line.end.y);
	const maxY = Math.max(line.start.y, line.end.y);
	const horizontalTravel =
		direction === "left_to_right" || direction === "right_to_left";
	return normalizeRegion(
		horizontalTravel
			? {
					x: minX - 0.3,
					y: minY - 0.08,
					width: maxX - minX + 0.6,
					height: maxY - minY + 0.16,
				}
			: {
					x: minX - 0.08,
					y: minY - 0.3,
					width: maxX - minX + 0.16,
					height: maxY - minY + 0.6,
				},
	);
}

function componentToCandidate(
	component: MotionComponent,
	bounds: PixelBounds,
	options: Pick<typeof DEFAULT_OPTIONS, "minAreaRatio" | "maxAreaRatio">,
): ObjectCandidate | null {
	const width = component.maxX - component.minX + 1;
	const height = component.maxY - component.minY + 1;
	const regionArea = Math.max(
		1,
		(bounds.right - bounds.left) * (bounds.bottom - bounds.top),
	);
	const areaRatio = component.area / regionArea;
	const boxAreaRatio = (width * height) / regionArea;
	const fillRatio = component.area / Math.max(1, width * height);
	const aspect = Math.max(
		width / Math.max(1, height),
		height / Math.max(1, width),
	);
	if (
		areaRatio < options.minAreaRatio ||
		boxAreaRatio > options.maxAreaRatio ||
		width < 6 ||
		height < 6 ||
		fillRatio < 0.18 ||
		aspect > 5.5
	) {
		return null;
	}
	const confidence = Math.min(
		0.93,
		0.55 + Math.min(0.2, areaRatio * 5) + Math.min(0.18, fillRatio * 0.22),
	);
	return {
		type: "plate",
		confidence,
		label: "motion-served-object",
		source: "motion",
		bbox: [component.minX, component.minY, width, height],
	};
}

type PixelBounds = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

type MotionComponent = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	area: number;
};

function connectedComponents(
	mask: Uint8Array,
	width: number,
	bounds: PixelBounds,
) {
	const visited = new Uint8Array(mask.length);
	const queue = new Int32Array(mask.length);
	const components: MotionComponent[] = [];
	for (let y = bounds.top; y < bounds.bottom; y++) {
		for (let x = bounds.left; x < bounds.right; x++) {
			const start = y * width + x;
			if (!mask[start] || visited[start]) continue;
			let head = 0;
			let tail = 0;
			queue[tail++] = start;
			visited[start] = 1;
			let area = 0;
			let minX = x;
			let minY = y;
			let maxX = x;
			let maxY = y;
			while (head < tail) {
				const pixel = queue[head++];
				const currentX = pixel % width;
				const currentY = Math.floor(pixel / width);
				area += 1;
				minX = Math.min(minX, currentX);
				minY = Math.min(minY, currentY);
				maxX = Math.max(maxX, currentX);
				maxY = Math.max(maxY, currentY);
				for (let offsetY = -1; offsetY <= 1; offsetY++) {
					for (let offsetX = -1; offsetX <= 1; offsetX++) {
						if (offsetX === 0 && offsetY === 0) continue;
						const nextX = currentX + offsetX;
						const nextY = currentY + offsetY;
						if (
							nextX < bounds.left ||
							nextX >= bounds.right ||
							nextY < bounds.top ||
							nextY >= bounds.bottom
						) {
							continue;
						}
						const next = nextY * width + nextX;
						if (!mask[next] || visited[next]) continue;
						visited[next] = 1;
						queue[tail++] = next;
					}
				}
			}
			components.push({ minX, minY, maxX, maxY, area });
		}
	}
	return components.sort((a, b) => b.area - a.area);
}

function cleanBinaryMask(
	mask: Uint8Array,
	width: number,
	height: number,
	bounds: PixelBounds,
) {
	const closed = erode(dilate(mask, width, height, bounds), width, bounds);
	return dilate(erode(closed, width, bounds), width, height, bounds);
}

function dilate(
	mask: Uint8Array,
	width: number,
	height: number,
	bounds: PixelBounds,
) {
	const output = new Uint8Array(mask.length);
	for (let y = bounds.top; y < bounds.bottom; y++) {
		for (let x = bounds.left; x < bounds.right; x++) {
			let active = 0;
			for (let dy = -1; dy <= 1 && !active; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
					if (mask[ny * width + nx]) {
						active = 1;
						break;
					}
				}
			}
			output[y * width + x] = active;
		}
	}
	return output;
}

function erode(mask: Uint8Array, width: number, bounds: PixelBounds) {
	const output = new Uint8Array(mask.length);
	for (let y = bounds.top; y < bounds.bottom; y++) {
		for (let x = bounds.left; x < bounds.right; x++) {
			let active = 1;
			for (let dy = -1; dy <= 1 && active; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (
						nx < bounds.left ||
						nx >= bounds.right ||
						ny < bounds.top ||
						ny >= bounds.bottom ||
						!mask[ny * width + nx]
					) {
						active = 0;
						break;
					}
				}
			}
			output[y * width + x] = active;
		}
	}
	return output;
}

function looksLikeShadow(
	r: number,
	g: number,
	b: number,
	br: number,
	bg: number,
	bb: number,
	currentLuma: number,
	backgroundLuma: number,
) {
	if (currentLuma >= backgroundLuma || backgroundLuma < 18) return false;
	const brightnessRatio = currentLuma / backgroundLuma;
	if (brightnessRatio < 0.48 || brightnessRatio > 0.94) return false;
	const chromaDifference =
		Math.abs(r - g - (br - bg)) +
		Math.abs(g - b - (bg - bb)) +
		Math.abs(b - r - (bb - br));
	return chromaDifference < 34;
}

function regionBounds(
	region: NormalizedRegion,
	width: number,
	height: number,
): PixelBounds {
	return {
		left: Math.max(0, Math.floor(region.x * width)),
		top: Math.max(0, Math.floor(region.y * height)),
		right: Math.min(width, Math.ceil((region.x + region.width) * width)),
		bottom: Math.min(height, Math.ceil((region.y + region.height) * height)),
	};
}

function normalizeRegion(region: NormalizedRegion): NormalizedRegion {
	const x = clamp01(region.x);
	const y = clamp01(region.y);
	return {
		x,
		y,
		width: Math.max(0.03, Math.min(1 - x, region.width)),
		height: Math.max(0.03, Math.min(1 - y, region.height)),
	};
}

function fullRegion(): NormalizedRegion {
	return { x: 0, y: 0, width: 1, height: 1 };
}

function validateFrame(frame: PixelFrame) {
	if (
		frame.width <= 0 ||
		frame.height <= 0 ||
		frame.data.length < frame.width * frame.height * 4
	) {
		throw new Error("Invalid pixel frame supplied to motion detector.");
	}
}

function luma(r: number, g: number, b: number) {
	return r * 0.299 + g * 0.587 + b * 0.114;
}

function blend(previous: number, next: number, rate: number) {
	return previous + (next - previous) * rate;
}

function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
