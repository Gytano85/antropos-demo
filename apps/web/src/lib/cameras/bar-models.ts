import { BEVERAGE_MODEL_CLASSES } from "./bar-service-detector";
import type { YoloModelConfig } from "./yolo-onnx-runtime";

/**
 * Modelos ONNX disponibles para el conteo de barra.
 *
 * El orden de `classNames` es el indice de clase del modelo y debe coincidir
 * con el `names` con el que fue entrenado; si no coincide, el detector
 * confundira unas clases con otras.
 */

/** Orden de clases leido de los metadatos del propio yolov8n.onnx. */
export const COCO_CLASSES = [
	"person",
	"bicycle",
	"car",
	"motorcycle",
	"airplane",
	"bus",
	"train",
	"truck",
	"boat",
	"traffic light",
	"fire hydrant",
	"stop sign",
	"parking meter",
	"bench",
	"bird",
	"cat",
	"dog",
	"horse",
	"sheep",
	"cow",
	"elephant",
	"bear",
	"zebra",
	"giraffe",
	"backpack",
	"umbrella",
	"handbag",
	"tie",
	"suitcase",
	"frisbee",
	"skis",
	"snowboard",
	"sports ball",
	"kite",
	"baseball bat",
	"baseball glove",
	"skateboard",
	"surfboard",
	"tennis racket",
	"bottle",
	"wine glass",
	"cup",
	"fork",
	"knife",
	"spoon",
	"bowl",
	"banana",
	"apple",
	"sandwich",
	"orange",
	"broccoli",
	"carrot",
	"hot dog",
	"pizza",
	"donut",
	"cake",
	"chair",
	"couch",
	"potted plant",
	"bed",
	"dining table",
	"toilet",
	"tv",
	"laptop",
	"mouse",
	"remote",
	"keyboard",
	"cell phone",
	"microwave",
	"oven",
	"toaster",
	"sink",
	"refrigerator",
	"book",
	"clock",
	"vase",
	"scissors",
	"teddy bear",
	"hair drier",
	"toothbrush",
] as const;

export type BarModelId = "beverage" | "coco";

export type BarModelDefinition = YoloModelConfig & {
	id: BarModelId;
	label: string;
	description: string;
};

export const BEVERAGE_MODEL: BarModelDefinition = {
	id: "beverage",
	label: "Beverage Containers",
	description:
		"Especializado en recipientes de bebida: distingue lata, tarro, copa y botella.",
	modelUrl: "/models/beverage-containers.onnx",
	classNames: BEVERAGE_MODEL_CLASSES,
	scoreThreshold: 0.3,
};

export const COCO_MODEL: BarModelDefinition = {
	id: "coco",
	label: "YOLOv8n COCO",
	description:
		"Modelo general. Detecta botella, copa y vaso, pero no distingue latas.",
	modelUrl: "/models/yolov8n.onnx",
	classNames: COCO_CLASSES,
	scoreThreshold: 0.3,
};

/**
 * Preferimos el modelo especializado y caemos al general si aun no se han
 * copiado sus pesos a /public/models.
 */
export const BAR_MODEL_PREFERENCE: BarModelDefinition[] = [
	BEVERAGE_MODEL,
	COCO_MODEL,
];

export async function resolveAvailableBarModel(
	fetchImpl: typeof fetch = fetch,
): Promise<BarModelDefinition> {
	for (const model of BAR_MODEL_PREFERENCE) {
		if (await modelExists(model.modelUrl, fetchImpl)) return model;
	}
	return COCO_MODEL;
}

async function modelExists(url: string, fetchImpl: typeof fetch) {
	try {
		const response = await fetchImpl(url, { method: "HEAD" });
		return response.ok;
	} catch {
		return false;
	}
}
