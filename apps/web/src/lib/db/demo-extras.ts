import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from ".";
import {
	brandingSettings,
	ingredientCounts,
	ingredientMovements,
	ingredients,
	orderItems,
	orders,
	paymentMethods,
	products,
	restockAlerts,
	restockRules,
	suppliers,
	transactions,
} from "./schema";

const DEMO_SHRINKAGE_MARKER = "DEMO_SHRINKAGE_SEED";
const DEFAULT_COMPANY_NAME = "FinOpenPOS";
const DEFAULT_PRIMARY_COLOR = "#0f172a";

// ── Branding (white-label) ─────────────────────────────────────────────────
export async function seedBrandingDemo(userId: string) {
	const existing = await db.query.brandingSettings.findFirst({
		where: eq(brandingSettings.user_uid, userId),
	});

	if (
		existing &&
		!(
			existing.company_name === DEFAULT_COMPANY_NAME &&
			existing.primary_color === DEFAULT_PRIMARY_COLOR
		)
	) {
		// El usuario ya personalizó su marca; no la sobrescribimos.
		return;
	}

	const demoBranding = {
		company_name: "Antros Club",
		primary_color: "#9333ea",
		updated_at: new Date(),
	};

	if (existing) {
		await db
			.update(brandingSettings)
			.set(demoBranding)
			.where(eq(brandingSettings.user_uid, userId));
	} else {
		await db.insert(brandingSettings).values({
			user_uid: userId,
			...demoBranding,
		});
	}
}

// ── Suppliers + restock rules + contact history ─────────────────────────────
const DEMO_SUPPLIERS = [
	{
		name: "Licorera del Centro",
		contact_name: "Roberto Salinas",
		email: "ventas@licoreradelcentro.mx",
		phone: "+5215512345678",
		notes: "Entrega en 24-48h. Pedido mínimo 6 botellas por etiqueta.",
	},
	{
		name: "Distribuidora Premium Spirits",
		contact_name: "Karla Jiménez",
		email: "pedidos@premiumspirits.mx",
		phone: "+5215598765432",
		notes: "Especialistas en vodka y whisky importado.",
	},
	{
		name: "Vinos y Licores Nocturna",
		contact_name: "Hugo Treviño",
		email: "compras@vinosnocturna.mx",
		phone: "+5215587654321",
		notes: "Proveedor de respaldo, entrega el mismo día en CDMX.",
	},
] as const;

export async function seedSuppliersAndRestockDemo(userId: string) {
	const existingSuppliers = await db
		.select({ count: sql<number>`count(*)` })
		.from(suppliers)
		.where(eq(suppliers.user_uid, userId));

	if (existingSuppliers[0].count > 0) return;

	const insertedSuppliers = await db
		.insert(suppliers)
		.values(
			DEMO_SUPPLIERS.map((supplier) => ({ ...supplier, user_uid: userId })),
		)
		.returning();

	const [licorera, premiumSpirits, vinosNocturna] = insertedSuppliers;

	const lowStockProducts = await db
		.select({ id: products.id, name: products.name, in_stock: products.in_stock })
		.from(products)
		.where(eq(products.user_uid, userId));

	const byName = new Map(lowStockProducts.map((p) => [p.name, p]));
	const ronZacapa = byName.get("Ron Zacapa 23");
	const greyGoose = byName.get("Vodka Grey Goose");
	const johnnieWalker = byName.get("Whisky Johnnie Walker Black");

	const ruleDefinitions: Array<{
		product: typeof ronZacapa;
		supplierId: number;
		autoSms: boolean;
		lastTriggeredHoursAgo: number;
	}> = [
		{ product: ronZacapa, supplierId: licorera.id, autoSms: false, lastTriggeredHoursAgo: 5 },
		{ product: greyGoose, supplierId: premiumSpirits.id, autoSms: true, lastTriggeredHoursAgo: 26 },
		{ product: johnnieWalker, supplierId: premiumSpirits.id, autoSms: true, lastTriggeredHoursAgo: 3 },
	];

	for (const def of ruleDefinitions) {
		if (!def.product) continue;

		const triggeredAt = new Date(
			Date.now() - def.lastTriggeredHoursAgo * 60 * 60 * 1000,
		);

		const [rule] = await db
			.insert(restockRules)
			.values({
				user_uid: userId,
				product_id: def.product.id,
				supplier_id: def.supplierId,
				threshold_quantity: 15,
				reorder_quantity: 24,
				auto_contact_email: true,
				auto_contact_sms: def.autoSms,
				is_active: true,
				cooldown_hours: 24,
				last_triggered_at: triggeredAt,
			})
			.returning();

		const isJohnnieWalker = def.product.name === "Whisky Johnnie Walker Black";

		await db.insert(restockAlerts).values({
			user_uid: userId,
			rule_id: rule.id,
			product_id: def.product.id,
			supplier_id: def.supplierId,
			stock_at_trigger: def.product.in_stock,
			requested_quantity: 24,
			channel: def.autoSms ? "both" : "email",
			email_status: "sent",
			sms_status: def.autoSms ? (isJohnnieWalker ? "failed" : "sent") : null,
			error_message: isJohnnieWalker
				? "Twilio rechazó el envío: verifica el número del proveedor."
				: null,
			created_at: triggeredAt,
		});
	}
}

// ── Theft / shrinkage demo data ─────────────────────────────────────────────
export async function seedShrinkageDemo(userId: string) {
	const marker = await db
		.select({ id: ingredientCounts.id })
		.from(ingredientCounts)
		.where(
			and(
				eq(ingredientCounts.user_uid, userId),
				eq(ingredientCounts.notes, DEMO_SHRINKAGE_MARKER),
			),
		)
		.limit(1);

	if (marker.length > 0) return;

	const ingredientRows = await db
		.select()
		.from(ingredients)
		.where(eq(ingredients.user_uid, userId));
	const byName = new Map(ingredientRows.map((i) => [i.name, i]));

	// 1) Diferencias de conteo físico: el sistema cree que hay más inventario
	//    del que realmente hay en el bar (señal clásica de merma o robo).
	const countTargets: Array<[string, number]> = [
		["Tequila blanco", -0.2],
		["Ron blanco", -0.15],
	];

	for (const [name, pct] of countTargets) {
		const ingredient = byName.get(name);
		if (!ingredient) continue;

		const varianceQuantity = Math.round(ingredient.stock_quantity * pct);
		const countedQuantity = ingredient.stock_quantity + varianceQuantity;
		const denominator = Math.max(
			Math.abs(ingredient.stock_quantity),
			ingredient.package_size * 0.01,
			0.0001,
		);
		const variancePercent = (varianceQuantity / denominator) * 100;

		await db.insert(ingredientCounts).values({
			ingredient_id: ingredient.id,
			expected_quantity: ingredient.stock_quantity,
			counted_quantity: countedQuantity,
			variance_quantity: varianceQuantity,
			variance_percent: variancePercent,
			exceeds_tolerance: Math.abs(variancePercent) > 7,
			notes: DEMO_SHRINKAGE_MARKER,
			user_uid: userId,
		});

		await db
			.update(ingredients)
			.set({ stock_quantity: countedQuantity, updated_at: new Date() })
			.where(eq(ingredients.id, ingredient.id));

		await db.insert(ingredientMovements).values({
			ingredient_id: ingredient.id,
			movement_type: "physical_count_adjustment",
			quantity: varianceQuantity,
			expected_quantity: ingredient.stock_quantity,
			notes: "Demo: faltante detectado en conteo físico (posible merma o robo)",
			user_uid: userId,
		});
	}

	// 2) Orden cuyo consumo registrado de tequila quedó muy por debajo de lo
	//    que la receta de la Margarita exige (posible desvío de botella).
	const margarita = await db.query.products.findFirst({
		where: and(eq(products.user_uid, userId), eq(products.name, "Margarita")),
	});
	const tequila = byName.get("Tequila blanco");
	const licorNaranja = byName.get("Licor de naranja");
	const jugoLimon = byName.get("Jugo de limón");

	if (margarita && tequila && licorNaranja && jugoLimon) {
		const quantitySold = 3;

		const [order] = await db
			.insert(orders)
			.values({
				total_amount: margarita.price * quantitySold,
				user_uid: userId,
				status: "completed",
			})
			.returning();

		const [orderItem] = await db
			.insert(orderItems)
			.values({
				order_id: order.id,
				product_id: margarita.id,
				quantity: quantitySold,
				price: margarita.price,
			})
			.returning();

		const expectedTequila = 45 * quantitySold;
		const recordedTequila = expectedTequila * 0.5;
		const expectedNaranja = 20 * quantitySold;
		const expectedLimon = 25 * quantitySold;

		await db.insert(ingredientMovements).values([
			{
				ingredient_id: tequila.id,
				order_id: order.id,
				order_item_id: orderItem.id,
				movement_type: "consumption",
				quantity: -recordedTequila,
				expected_quantity: expectedTequila,
				notes: "Demo: consumo registrado muy por debajo de lo que exige la receta",
				user_uid: userId,
			},
			{
				ingredient_id: licorNaranja.id,
				order_id: order.id,
				order_item_id: orderItem.id,
				movement_type: "consumption",
				quantity: -expectedNaranja,
				expected_quantity: expectedNaranja,
				user_uid: userId,
			},
			{
				ingredient_id: jugoLimon.id,
				order_id: order.id,
				order_item_id: orderItem.id,
				movement_type: "consumption",
				quantity: -expectedLimon,
				expected_quantity: expectedLimon,
				user_uid: userId,
			},
		]);

		await db
			.update(ingredients)
			.set({ stock_quantity: sql`${ingredients.stock_quantity} - ${recordedTequila}` })
			.where(eq(ingredients.id, tequila.id));
		await db
			.update(ingredients)
			.set({ stock_quantity: sql`${ingredients.stock_quantity} - ${expectedNaranja}` })
			.where(eq(ingredients.id, licorNaranja.id));
		await db
			.update(ingredients)
			.set({ stock_quantity: sql`${ingredients.stock_quantity} - ${expectedLimon}` })
			.where(eq(ingredients.id, jugoLimon.id));

		const anyPaymentMethod = await db.query.paymentMethods.findFirst();

		await db.insert(transactions).values({
			description: `Consumo de barra — Margarita x${quantitySold}`,
			order_id: order.id,
			payment_method_id: anyPaymentMethod?.id,
			amount: margarita.price * quantitySold,
			user_uid: userId,
			type: "income",
			category: "selling",
			status: "completed",
		});
	}
}

// ── Product images ───────────────────────────────────────────────────────────
export async function seedProductImagesDemo(userId: string) {
	const rows = await db
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.user_uid, userId), isNull(products.image_url)));

	for (const row of rows) {
		await db
			.update(products)
			.set({ image_url: `https://picsum.photos/seed/antros-product-${row.id}/400/400` })
			.where(eq(products.id, row.id));
	}
}
