import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
	type BottleScaleStatus,
	evaluateBottleScale,
} from "@/lib/alcohol-control/scale-engine";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "../init";

type QueryResult<T> = T[] | { rows?: T[] };

type BottleRow = {
	id: number;
	name: string;
	scale_key: string | null;
	ingredient_id: number | null;
	empty_weight_g: number;
	full_volume_ml: number;
	density_g_ml: number;
	expected_used_ml: number;
	tolerance_ml: number;
	current_weight_g: number | null;
	last_reading_at: Date | string | null;
};

type ReadingRow = {
	id: number;
	bottle_id: number;
	weight_g: number;
	expected_used_ml: number;
	physical_used_ml: number;
	difference_ml: number;
	status: BottleScaleStatus;
	created_at: Date | string | null;
};

type ExpectedUsageRow = {
	expected_used_ml: string | number | null;
};

const saveBottleInput = z.object({
	id: z.number().optional(),
	name: z.string().min(1).max(160),
	ingredientId: z.number().nullable().optional(),
	emptyWeightG: z.number().min(1).max(5000),
	fullVolumeMl: z.number().min(50).max(5000),
	densityGPerMl: z.number().min(0.6).max(1.3),
	expectedUsedMl: z.number().min(0).max(5000),
	toleranceMl: z.number().min(0).max(500),
});

const recordReadingInput = z.object({
	bottleId: z.number(),
	weightG: z.number().min(1).max(10000),
	expectedUsedMl: z.number().min(0).max(5000).optional(),
});

function rows<T>(result: QueryResult<T>) {
	return Array.isArray(result) ? result : (result.rows ?? []);
}

export async function ensureAlcoholControlTables() {
	const statements = [
		`CREATE TABLE IF NOT EXISTS bottle_scales (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			name varchar(160) NOT NULL,
			scale_key varchar(120),
			ingredient_id integer,
			empty_weight_g real NOT NULL DEFAULT 450,
			full_volume_ml real NOT NULL DEFAULT 750,
			density_g_ml real NOT NULL DEFAULT 0.95,
			expected_used_ml real NOT NULL DEFAULT 0,
			tolerance_ml real NOT NULL DEFAULT 45,
			current_weight_g real,
			last_reading_at timestamp,
			created_at timestamp DEFAULT now(),
			updated_at timestamp DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS bottle_scale_readings (
			id serial PRIMARY KEY,
			user_uid varchar(255) NOT NULL,
			bottle_id integer NOT NULL,
			weight_g real NOT NULL,
			expected_used_ml real NOT NULL,
			current_volume_ml real NOT NULL,
			physical_used_ml real NOT NULL,
			difference_ml real NOT NULL,
			status varchar(20) NOT NULL,
			message text NOT NULL,
			created_at timestamp DEFAULT now()
		)`,
	];

	for (const statement of statements) {
		await db.execute(sql.raw(statement));
	}
	await db.execute(
		sql.raw(
			"ALTER TABLE bottle_scales ADD COLUMN IF NOT EXISTS scale_key varchar(120)",
		),
	);
}

async function ensureAlcoholDemo(userId: string) {
	await ensureAlcoholControlTables();
	const existing = rows<{ count: string | number }>(
		await db.execute(
			sql`SELECT count(*) as count FROM bottle_scales WHERE user_uid = ${userId}`,
		),
	);
	if (Number(existing[0]?.count ?? 0) > 0) return;

	const ingredients = rows<{ id: number; name: string }>(
		await db.execute(sql`
			SELECT id, name FROM ingredients
			WHERE user_uid = ${userId}
		`),
	);
	const ingredientId = (name: string) =>
		ingredients.find((item) =>
			item.name.toLowerCase().includes(name.toLowerCase()),
		)?.id ?? null;

	await db.execute(sql`
		INSERT INTO bottle_scales (
			user_uid, name, scale_key, ingredient_id, empty_weight_g, full_volume_ml,
			density_g_ml, expected_used_ml, tolerance_ml, current_weight_g, last_reading_at
		)
		VALUES
			(${userId}, 'Don Julio 70', 'scale-don-julio-70', ${ingredientId("Don Julio")}, 610, 700, 0.95, 135, 45, 1062.5, now()),
			(${userId}, 'Buchanan''s 12', 'scale-buchanans-12', ${ingredientId("Buchanan")}, 650, 750, 0.94, 90, 45, 1214, now()),
			(${userId}, 'Grey Goose', 'scale-grey-goose', ${ingredientId("Grey Goose")}, 620, 750, 0.96, 220, 60, 1080.8, now())
	`);

	const bottles = rows<BottleRow>(
		await db.execute(sql`
			SELECT * FROM bottle_scales
			WHERE user_uid = ${userId}
			ORDER BY id
		`),
	);
	for (const bottle of bottles) {
		await insertReading(userId, bottle, bottle.current_weight_g ?? 0);
	}
}

async function insertReading(
	userId: string,
	bottle: BottleRow,
	weightG: number,
) {
	const expectedUsedMl = await expectedUsageFromRecipes(userId, bottle);
	const evaluation = evaluateBottleScale({
		bottleName: bottle.name,
		emptyBottleWeightG: Number(bottle.empty_weight_g),
		fullVolumeMl: Number(bottle.full_volume_ml),
		densityGPerMl: Number(bottle.density_g_ml),
		currentWeightG: weightG,
		expectedUsedMl,
		toleranceMl: Number(bottle.tolerance_ml),
	});

	await db.execute(sql`
		INSERT INTO bottle_scale_readings (
			user_uid, bottle_id, weight_g, expected_used_ml, current_volume_ml,
			physical_used_ml, difference_ml, status, message
		)
		VALUES (
			${userId}, ${bottle.id}, ${weightG}, ${evaluation.expectedUsedMl},
			${evaluation.currentVolumeMl}, ${evaluation.physicalUsedMl},
			${evaluation.differenceMl}, ${evaluation.status}, ${evaluation.message}
		)
	`);

	await db.execute(sql`
		UPDATE bottle_scales
		SET current_weight_g = ${weightG}, last_reading_at = now(), updated_at = now()
		WHERE id = ${bottle.id} AND user_uid = ${userId}
	`);

	return evaluation;
}

async function expectedUsageFromRecipes(userId: string, bottle: BottleRow) {
	if (!bottle.ingredient_id) return Number(bottle.expected_used_ml);
	try {
		const row = rows<ExpectedUsageRow>(
			await db.execute(sql`
				SELECT COALESCE(SUM(order_items.quantity * recipe_items.quantity), 0) as expected_used_ml
				FROM order_items
				INNER JOIN orders ON order_items.order_id = orders.id
				INNER JOIN recipes ON recipes.product_id = order_items.product_id
				INNER JOIN recipe_items ON recipe_items.recipe_id = recipes.id
				WHERE orders.user_uid = ${userId}
					AND recipes.user_uid = ${userId}
					AND recipe_items.ingredient_id = ${bottle.ingredient_id}
					AND orders.created_at >= NOW() - INTERVAL '24 hours'
			`),
		)[0];
		const expected = Number(row?.expected_used_ml ?? 0);
		return expected > 0 ? expected : Number(bottle.expected_used_ml);
	} catch {
		return Number(bottle.expected_used_ml);
	}
}

export const alcoholControlRouter = router({
	overview: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
		await ensureAlcoholDemo(ctx.user.id);

		const [bottleResult, readingResult] = await Promise.all([
			db.execute(sql`
				SELECT * FROM bottle_scales
				WHERE user_uid = ${ctx.user.id}
				ORDER BY id
			`),
			db.execute(sql`
				SELECT * FROM bottle_scale_readings
				WHERE user_uid = ${ctx.user.id}
				ORDER BY created_at DESC, id DESC
				LIMIT 30
			`),
		]);
		const bottles = rows<BottleRow>(bottleResult);
		const readings = rows<ReadingRow>(readingResult);
		const evaluations = await Promise.all(
			bottles.map(async (bottle) =>
				evaluateBottleScale({
					bottleName: bottle.name,
					emptyBottleWeightG: Number(bottle.empty_weight_g),
					fullVolumeMl: Number(bottle.full_volume_ml),
					densityGPerMl: Number(bottle.density_g_ml),
					currentWeightG: Number(
						bottle.current_weight_g ??
							Number(bottle.empty_weight_g) +
								Number(bottle.full_volume_ml) * Number(bottle.density_g_ml),
					),
					expectedUsedMl: await expectedUsageFromRecipes(ctx.user.id, bottle),
					toleranceMl: Number(bottle.tolerance_ml),
				}),
			),
		);

		return {
			bottles: bottles.map((bottle, index) => ({
				id: bottle.id,
				name: bottle.name,
				scaleKey: bottle.scale_key,
				ingredientId: bottle.ingredient_id,
				emptyWeightG: Number(bottle.empty_weight_g),
				fullVolumeMl: Number(bottle.full_volume_ml),
				densityGPerMl: Number(bottle.density_g_ml),
				expectedUsedMl: Number(bottle.expected_used_ml),
				toleranceMl: Number(bottle.tolerance_ml),
				currentWeightG: bottle.current_weight_g
					? Number(bottle.current_weight_g)
					: null,
				lastReadingAt:
					bottle.last_reading_at instanceof Date
						? bottle.last_reading_at.toISOString()
						: bottle.last_reading_at,
				evaluation: evaluations[index],
			})),
			readings: readings.map((reading) => ({
				id: reading.id,
				bottleId: reading.bottle_id,
				weightG: Number(reading.weight_g),
				expectedUsedMl: Number(reading.expected_used_ml),
				physicalUsedMl: Number(reading.physical_used_ml),
				differenceMl: Number(reading.difference_ml),
				status: reading.status,
				createdAt:
					reading.created_at instanceof Date
						? reading.created_at.toISOString()
						: reading.created_at,
			})),
			summary: {
				totalBottles: bottles.length,
				reviewCount: evaluations.filter((item) => item.status !== "ok").length,
				criticalCount: evaluations.filter((item) => item.status === "critical")
					.length,
				totalDifferenceMl: Math.round(
					evaluations.reduce((sum, item) => sum + item.differenceMl, 0),
				),
			},
		};
	}),

	saveBottle: protectedProcedure
		.input(saveBottleInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureAlcoholControlTables();
			if (input.id) {
				await db.execute(sql`
					UPDATE bottle_scales
					SET name = ${input.name}, ingredient_id = ${input.ingredientId ?? null},
						empty_weight_g = ${input.emptyWeightG}, full_volume_ml = ${input.fullVolumeMl},
						density_g_ml = ${input.densityGPerMl}, expected_used_ml = ${input.expectedUsedMl},
						tolerance_ml = ${input.toleranceMl}, updated_at = now()
					WHERE id = ${input.id} AND user_uid = ${ctx.user.id}
				`);
				return { ok: true };
			}

			await db.execute(sql`
				INSERT INTO bottle_scales (
					user_uid, name, ingredient_id, empty_weight_g, full_volume_ml,
					density_g_ml, expected_used_ml, tolerance_ml
				)
				VALUES (
					${ctx.user.id}, ${input.name}, ${input.ingredientId ?? null},
					${input.emptyWeightG}, ${input.fullVolumeMl}, ${input.densityGPerMl},
					${input.expectedUsedMl}, ${input.toleranceMl}
				)
			`);
			return { ok: true };
		}),

	recordReading: protectedProcedure
		.input(recordReadingInput)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
			await ensureAlcoholControlTables();
			const bottle = rows<BottleRow>(
				await db.execute(sql`
					SELECT * FROM bottle_scales
					WHERE id = ${input.bottleId} AND user_uid = ${ctx.user.id}
					LIMIT 1
				`),
			)[0];
			if (!bottle) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Botella no encontrada",
				});
			}
			const patchedBottle = {
				...bottle,
				expected_used_ml: input.expectedUsedMl ?? bottle.expected_used_ml,
			};
			const evaluation = await insertReading(
				ctx.user.id,
				patchedBottle,
				input.weightG,
			);
			return { ok: true, evaluation };
		}),
});
