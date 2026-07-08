import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser } from "@/lib/auth-guard";

const requestSchema = z.object({
	imageDataUrl: z.string().min(100),
	modelId: z.string().min(3).max(160),
	confidenceThreshold: z.number().min(0.1).max(0.95),
});

type RoboflowPrediction = {
	class?: string;
	confidence?: number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
};

export async function POST(request: Request) {
	const user = await getAuthUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = requestSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	const apiKey = process.env.ROBOFLOW_API_KEY;
	if (!apiKey) {
		return NextResponse.json({
			configured: false,
			personCount: 0,
			confidenceAvg: null,
			predictions: [],
			message: "Falta ROBOFLOW_API_KEY en variables de entorno.",
		});
	}

	const { imageDataUrl, modelId, confidenceThreshold } = parsed.data;
	const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
	const confidence = Math.round(confidenceThreshold * 100);
	const endpoint = `https://detect.roboflow.com/${modelId}?api_key=${encodeURIComponent(apiKey)}&confidence=${confidence}`;

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: base64,
		});

		if (!response.ok) {
			const text = await response.text();
			return NextResponse.json(
				{
					configured: true,
					error: `Roboflow ${response.status}`,
					detail: text.slice(0, 300),
					personCount: 0,
					confidenceAvg: null,
					predictions: [],
				},
				{ status: 502 },
			);
		}

		const result = (await response.json()) as { predictions?: RoboflowPrediction[] };
		const people = (result.predictions ?? []).filter((prediction) =>
			isPersonClass(prediction.class),
		);
		const confidenceAvg =
			people.length > 0
				? people.reduce((sum, item) => sum + Number(item.confidence ?? 0), 0) /
					people.length
				: null;

		return NextResponse.json({
			configured: true,
			personCount: people.length,
			confidenceAvg,
			predictions: people.map((prediction) => ({
				class: prediction.class,
				confidence: prediction.confidence,
				x: prediction.x,
				y: prediction.y,
				width: prediction.width,
				height: prediction.height,
			})),
		});
	} catch (error) {
		return NextResponse.json(
			{
				configured: true,
				error: error instanceof Error ? error.message : "Detection failed",
				personCount: 0,
				confidenceAvg: null,
				predictions: [],
			},
			{ status: 502 },
		);
	}
}

function isPersonClass(value?: string) {
	if (!value) return true;
	const normalized = value.toLowerCase();
	return (
		normalized.includes("person") ||
		normalized.includes("people") ||
		normalized.includes("human") ||
		normalized.includes("pedestrian")
	);
}
