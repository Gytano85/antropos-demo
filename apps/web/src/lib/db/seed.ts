import { faker } from "@faker-js/faker";
import { isNull, sql } from "drizzle-orm";
import { auth } from "../auth";
import { productPhotoUrl } from "../product-photos";
import { db } from ".";
import { ensureDemoRecipes } from "./demo-recipes";
import {
	branches,
	branchMemberships,
	cities,
	customers,
	orderItems,
	orders,
	organizations,
	paymentMethods,
	products,
	transactions,
	user,
} from "./schema";

const DEMO_EMAIL = "test@example.com";
const DEMO_PASSWORD = "test1234";
const DEMO_NAME = "Test User";

const EXPENSE_CATEGORIES = [
	"renta",
	"servicios",
	"inventario",
	"personal",
	"entretenimiento",
	"mantenimiento",
] as const;

const DEMO_CUSTOMERS = [
	["Sofía Hernández", "sofia.hernandez@example.com", "55 1010 2020"],
	["Diego Ramírez", "diego.ramirez@example.com", "55 1111 3030"],
	["Valeria Torres", "valeria.torres@example.com", "55 1212 4040"],
	["Mateo García", "mateo.garcia@example.com", "55 1313 5050"],
	["Camila Flores", "camila.flores@example.com", "55 1414 6060"],
	["Sebastián Cruz", "sebastian.cruz@example.com", "55 1515 7070"],
	["Renata Morales", "renata.morales@example.com", "55 1616 8080"],
	["Emiliano Reyes", "emiliano.reyes@example.com", "55 1717 9090"],
	["Regina Vargas", "regina.vargas@example.com", "55 1818 1010"],
	["Santiago Mendoza", "santiago.mendoza@example.com", "55 1919 2020"],
	["Daniela Castillo", "daniela.castillo@example.com", "55 2020 3030"],
	["Leonardo Rojas", "leonardo.rojas@example.com", "55 2121 4040"],
	["Mariana Navarro", "mariana.navarro@example.com", "55 2222 5050"],
	["Alejandro Silva", "alejandro.silva@example.com", "55 2323 6060"],
	["Natalia Romero", "natalia.romero@example.com", "55 2424 7070"],
	["Rodrigo Aguilar", "rodrigo.aguilar@example.com", "55 2525 8080"],
	["Ximena Medina", "ximena.medina@example.com", "55 2626 9090"],
	["Fernando Luna", "fernando.luna@example.com", "55 2727 1010"],
	["Paola Campos", "paola.campos@example.com", "55 2828 2020"],
	["Javier Ortega", "javier.ortega@example.com", "55 2929 3030"],
] as const;

const DEMO_PRODUCTS = [
	{
		category: "cervezas",
		name: "Corona Extra",
		description: "Cerveza clara, botella de 355 ml",
		price: 8500,
		stock: 144,
	},
	{
		category: "cervezas",
		name: "Modelo Especial",
		description: "Cerveza tipo pilsner, botella de 355 ml",
		price: 9000,
		stock: 120,
	},
	{
		category: "cervezas",
		name: "Victoria",
		description: "Cerveza ámbar, botella de 355 ml",
		price: 8500,
		stock: 96,
	},
	{
		category: "cervezas",
		name: "Michelob Ultra",
		description: "Cerveza ligera, botella de 355 ml",
		price: 9500,
		stock: 72,
	},
	{
		category: "cervezas",
		name: "Heineken",
		description: "Cerveza lager, botella de 355 ml",
		price: 10000,
		stock: 84,
	},
	{
		category: "cervezas",
		name: "XX Lager",
		description: "Cerveza lager, botella de 355 ml",
		price: 9000,
		stock: 78,
	},
	{
		category: "cocteles",
		name: "Mojito",
		description: "Ron blanco, hierbabuena, limón y agua mineral",
		price: 16000,
		stock: 60,
	},
	{
		category: "cocteles",
		name: "Margarita",
		description: "Tequila, licor de naranja y limón",
		price: 17000,
		stock: 60,
	},
	{
		category: "cocteles",
		name: "Paloma",
		description: "Tequila, toronja, limón y agua mineral",
		price: 16000,
		stock: 70,
	},
	{
		category: "cocteles",
		name: "Carajillo",
		description: "Licor 43 y espresso",
		price: 19000,
		stock: 45,
	},
	{
		category: "cocteles",
		name: "Gin Tonic",
		description: "Ginebra, agua tónica y cítricos",
		price: 19000,
		stock: 50,
	},
	{
		category: "cocteles",
		name: "Azulito",
		description: "Vodka, bebida energética y mezcla cítrica",
		price: 18000,
		stock: 55,
	},
	{
		category: "botellas",
		name: "Tequila Don Julio 70",
		description: "Botella de 700 ml con servicio de mezcladores",
		price: 320000,
		stock: 18,
	},
	{
		category: "botellas",
		name: "Tequila Maestro Dobel Diamante",
		description: "Botella de 750 ml con servicio de mezcladores",
		price: 290000,
		stock: 14,
	},
	{
		category: "botellas",
		name: "Whisky Buchanan's 12",
		description: "Botella de 750 ml con servicio de mezcladores",
		price: 280000,
		stock: 16,
	},
	{
		category: "botellas",
		name: "Whisky Johnnie Walker Black",
		description: "Botella de 750 ml con servicio de mezcladores",
		price: 260000,
		stock: 12,
	},
	{
		category: "botellas",
		name: "Vodka Grey Goose",
		description: "Botella de 750 ml con servicio de mezcladores",
		price: 270000,
		stock: 10,
	},
	{
		category: "botellas",
		name: "Ron Zacapa 23",
		description: "Botella de 750 ml con servicio de mezcladores",
		price: 300000,
		stock: 8,
	},
	{
		category: "sin_alcohol",
		name: "Agua Natural",
		description: "Botella de agua de 600 ml",
		price: 5000,
		stock: 120,
	},
	{
		category: "sin_alcohol",
		name: "Agua Mineral",
		description: "Botella de agua mineral de 355 ml",
		price: 6000,
		stock: 96,
	},
	{
		category: "sin_alcohol",
		name: "Refresco",
		description: "Coca-Cola, Sprite o agua tónica",
		price: 6000,
		stock: 150,
	},
	{
		category: "sin_alcohol",
		name: "Red Bull",
		description: "Bebida energética de 250 ml",
		price: 9000,
		stock: 72,
	},
	{
		category: "sin_alcohol",
		name: "Limonada Mineral",
		description: "Limón natural, jarabe y agua mineral",
		price: 8500,
		stock: 50,
	},
	{
		category: "snacks",
		name: "Papas a la Francesa",
		description: "Orden de papas con aderezo de la casa",
		price: 11000,
		stock: 40,
	},
	{
		category: "snacks",
		name: "Nachos con Queso",
		description: "Totopos, queso, jalapeños y pico de gallo",
		price: 14000,
		stock: 35,
	},
	{
		category: "snacks",
		name: "Alitas BBQ",
		description: "Orden de 10 alitas con vegetales",
		price: 19000,
		stock: 30,
	},
	{
		category: "snacks",
		name: "Mini Hamburguesas",
		description: "Tres mini hamburguesas con papas",
		price: 21000,
		stock: 25,
	},
	{
		category: "snacks",
		name: "Tabla de Carnes Frías",
		description: "Selección de carnes frías, quesos y aceitunas",
		price: 28000,
		stock: 18,
	},
	{
		category: "servicios",
		name: "Cover General",
		description: "Acceso general al evento",
		price: 20000,
		stock: 300,
	},
	{
		category: "servicios",
		name: "Cover Evento Especial",
		description: "Acceso para noche temática o artista invitado",
		price: 35000,
		stock: 180,
	},
	{
		category: "servicios",
		name: "Reservación Mesa VIP",
		description: "Reserva de mesa en zona VIP",
		price: 150000,
		stock: 12,
	},
	{
		category: "servicios",
		name: "Servicio de Mezcladores",
		description: "Hielo, refrescos, agua mineral y cítricos",
		price: 50000,
		stock: 50,
	},
] as const;

function getProductImageUrl(category: string, name: string) {
	const lower = name.toLowerCase();
	const byName: Record<string, string> = {
		"corona extra": productPhotoUrl("Corona Extra", category),
		"modelo especial": productPhotoUrl("Modelo Especial", category),
		victoria: productPhotoUrl("Victoria", category),
		heineken: productPhotoUrl("Heineken", category),
		margarita: productPhotoUrl("Margarita", category),
		carajillo: productPhotoUrl("Carajillo", category),
		"gin tonic": productPhotoUrl("Gin Tonic", category),
		azulito: productPhotoUrl("Azulito", category),
		"tequila don julio 70": productPhotoUrl("Tequila Don Julio 70", category),
		"whisky johnnie walker black": productPhotoUrl(
			"Whisky Johnnie Walker Black",
			category,
		),
		"vodka grey goose": productPhotoUrl("Vodka Grey Goose", category),
		"ron zacapa 23": productPhotoUrl("Ron Zacapa 23", category),
		"agua natural": productPhotoUrl("Agua Natural", category),
		"agua mineral": productPhotoUrl("Agua Mineral", category),
		refresco: productPhotoUrl("Refresco", category),
		"red bull": productPhotoUrl("Red Bull", category),
		"limonada mineral": productPhotoUrl("Limonada Mineral", category),
		"papas a la francesa": productPhotoUrl("Papas a la Francesa", category),
		"nachos con queso": productPhotoUrl("Nachos con Queso", category),
		"alitas bbq": productPhotoUrl("Alitas BBQ", category),
		"mini hamburguesas": productPhotoUrl("Mini Hamburguesas", category),
		"tabla de carnes frías": productPhotoUrl("Tabla de Carnes Frías", category),
		"cover general": productPhotoUrl("Cover General", category),
		"cover evento especial": productPhotoUrl("Cover Evento Especial", category),
		"reservación mesa vip": productPhotoUrl("Reservación Mesa VIP", category),
		"servicio de mezcladores": productPhotoUrl(
			"Servicio de Mezcladores",
			category,
		),
	};
	if (byName[lower]) return byName[lower];
	return productPhotoUrl(name, category);
}

export async function seed() {
	faker.seed(20260620);

	const [demoUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(sql`${user.email} = ${DEMO_EMAIL}`)
		.limit(1);
	const [demoProductCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(products)
		.where(sql`${products.user_uid} = ${demoUser?.id ?? ""}`);
	const [demoOrderCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(sql`${orders.user_uid} = ${demoUser?.id ?? ""}`);

	if (
		demoUser &&
		Number(demoProductCount.count) >= DEMO_PRODUCTS.length &&
		Number(demoOrderCount.count) >= 20
	) {
		await ensureDemoRecipes(demoUser.id);
		// Una base ya sembrada sale por aqui. Sin esto las sucursales solo
		// existirian tras borrar todo, que es justo lo que no queremos pedirle a
		// nadie con datos reales.
		const existingMethods = await db
			.select({ id: paymentMethods.id })
			.from(paymentMethods);
		await seedBranches(
			demoUser.id,
			existingMethods.map((method) => method.id),
		);
		return;
	}

	const existing = await db
		.select({ count: sql<number>`count(*)` })
		.from(paymentMethods);

	if (demoUser || existing[0].count > 0) {
		await db.execute(
			sql.raw(`
			TRUNCATE TABLE
				branch_role_permissions,
				branch_memberships,
				branches,
				organizations,
				ingredient_counts,
				ingredient_movements,
				recipe_items,
				recipes,
				ingredients,
				transactions,
				order_items,
				orders,
				customers,
				products,
				payment_methods,
				app_settings,
				restocking_settings,
				"session",
				account,
				"user"
			RESTART IDENTITY CASCADE
		`),
		);
	}

	// ── Payment Methods ──────────────────────────────────────────────────────
	const [pmCredit, pmDebit, pmCash] = await db
		.insert(paymentMethods)
		.values([
			{ name: "Tarjeta de crédito" },
			{ name: "Tarjeta de débito" },
			{ name: "Efectivo" },
		])
		.returning();

	const paymentMethodIds = [pmCredit.id, pmDebit.id, pmCash.id];

	// ── Demo User ────────────────────────────────────────────────────────────
	const signUpRes = await auth.api.signUpEmail({
		body: { name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD },
	});
	const userId = signUpRes.user.id;

	// Los metodos de pago se insertan antes de existir el usuario; ahora que hay
	// uno se les asigna dueño, o quedarian como catalogo heredado de solo lectura
	// y la pantalla de metodos de pago no dejaria editarlos.
	await db
		.update(paymentMethods)
		.set({ user_uid: userId })
		.where(isNull(paymentMethods.user_uid));

	// ── Customers ────────────────────────────────────────────────────────────
	const customerValues = DEMO_CUSTOMERS.map(([name, email, phone], index) => ({
		name,
		email,
		phone,
		user_uid: userId,
		status: index % 6 === 0 ? "inactive" : "active",
		created_at: faker.date.recent({ days: 90 }),
	}));

	const insertedCustomers = await db
		.insert(customers)
		.values(customerValues)
		.returning();

	// ── Products ─────────────────────────────────────────────────────────────
	const productValues = DEMO_PRODUCTS.map((product) => ({
		name: product.name,
		description: product.description,
		image_url: getProductImageUrl(product.category, product.name),
		price: product.price,
		in_stock: product.stock,
		user_uid: userId,
		category: product.category,
	}));

	const insertedProducts = await db
		.insert(products)
		.values(productValues)
		.returning();

	await ensureDemoRecipes(userId);

	// ── Orders + Order Items + Selling Transactions ──────────────────────────
	const orderCount = 40;
	for (let i = 0; i < orderCount; i++) {
		const customer = faker.helpers.arrayElement(insertedCustomers);
		const pmId = faker.helpers.arrayElement(paymentMethodIds);
		const itemCount = faker.number.int({ min: 1, max: 5 });
		const chosenProducts = faker.helpers.arrayElements(
			insertedProducts,
			itemCount,
		);

		const items = chosenProducts.map((p) => ({
			product_id: p.id,
			quantity: faker.number.int({ min: 1, max: 4 }),
			price: p.price,
		}));

		const totalAmount = items.reduce(
			(sum, item) => sum + item.price * item.quantity,
			0,
		);

		const createdAt = faker.date.recent({ days: 60 });

		const [order] = await db
			.insert(orders)
			.values({
				customer_id: customer.id,
				total_amount: totalAmount,
				user_uid: userId,
				status: faker.helpers.weightedArrayElement([
					{ value: "completed", weight: 8 },
					{ value: "pending", weight: 1.5 },
					{ value: "cancelled", weight: 0.5 },
				]),
				created_at: createdAt,
			})
			.returning();

		await db.insert(orderItems).values(
			items.map((item) => ({
				order_id: order.id,
				...item,
			})),
		);

		if (order.status === "completed") {
			await db.insert(transactions).values({
				description: `Consumo de mesa #${order.id}`,
				order_id: order.id,
				payment_method_id: pmId,
				amount: totalAmount,
				user_uid: userId,
				type: "income",
				category: "selling",
				status: "completed",
				created_at: createdAt,
			});
		}
	}

	// ── Expense Transactions ─────────────────────────────────────────────────
	const expenseCount = 25;
	for (let i = 0; i < expenseCount; i++) {
		const category = faker.helpers.arrayElement(EXPENSE_CATEGORIES);
		const descriptions: Record<string, () => string> = {
			renta: () => `Renta mensual del local — ${faker.date.month()}`,
			servicios: () =>
				faker.helpers.arrayElement([
					"Recibo de electricidad",
					"Servicio de agua",
					"Internet y terminales",
					"Servicio de seguridad privada",
				]),
			inventario: () =>
				faker.helpers.arrayElement([
					"Compra de licores y destilados",
					"Reposición de cerveza",
					"Compra de mezcladores y hielo",
					"Insumos de cocina y botanas",
				]),
			personal: () =>
				faker.helpers.arrayElement([
					"Nómina de meseros y bartenders",
					"Pago de personal de seguridad",
					"Honorarios de limpieza",
				]),
			entretenimiento: () =>
				faker.helpers.arrayElement([
					"Honorarios de DJ",
					"Producción de evento temático",
					"Publicidad en redes sociales",
					"Fotografía y contenido del evento",
				]),
			mantenimiento: () =>
				faker.helpers.arrayElement([
					"Mantenimiento de audio e iluminación",
					"Servicio de refrigeradores",
					"Reparación de barra",
					"Limpieza profunda del local",
				]),
		};

		await db.insert(transactions).values({
			description: descriptions[category](),
			payment_method_id: faker.helpers.arrayElement(paymentMethodIds),
			amount: faker.number.int({ min: 15000, max: 1800000 }),
			user_uid: userId,
			type: "expense",
			category,
			status: faker.helpers.weightedArrayElement([
				{ value: "completed", weight: 9 },
				{ value: "pending", weight: 1 },
			]),
			created_at: faker.date.recent({ days: 60 }),
		});
	}

	// ── Organización, sucursales y cuentas por rol ───────────────────────────
	const branchSummary = await seedBranches(userId, paymentMethodIds);

	// ── Cities (IBGE) ─────────────────────────────────────────────────────────
	const cityCount =
		process.env.DEMO_LIGHT_SEED === "1" ? 0 : await seedCities();

	console.log(
		`Seeded: 3 payment methods, 1 demo user (${DEMO_EMAIL} / ${DEMO_PASSWORD}), ` +
			`${customerValues.length} customers, ${productValues.length} products, ` +
			`${orderCount} orders, ${expenseCount} expense transactions, ` +
			`${cityCount} cities, ${branchSummary.branches} branches, ` +
			`${branchSummary.accounts} role accounts`,
	);
}

const STATES = [
	"AC",
	"AL",
	"AM",
	"AP",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MG",
	"MS",
	"MT",
	"PA",
	"PB",
	"PE",
	"PI",
	"PR",
	"RJ",
	"RN",
	"RO",
	"RR",
	"RS",
	"SC",
	"SE",
	"SP",
	"TO",
];

/**
 * Sucursales de demostracion y una cuenta por rol.
 *
 * El aislamiento por sucursal funciona porque `getAuthUser` sustituye el id del
 * usuario por el `data_scope_uid` de la sucursal activa, y los routers ya filtran
 * por ese id. Por eso CENTRO reutiliza el uid del usuario demo (hereda todos los
 * datos ya sembrados) y NORTE recibe un scope propio con su propio catalogo: sin
 * datos propios se veria vacia y pareceria rota.
 *
 * Las membresias son deliberadamente asimetricas para que se note el control de
 * acceso: hay cuentas en una sola sucursal, en ambas, y con permisos distintos.
 */
async function seedBranches(ownerUid: string, paymentMethodIds: number[]) {
	// Se puede llamar sobre una base ya sembrada, asi que nunca duplica.
	const [alreadySeeded] = await db
		.select({ id: branches.id })
		.from(branches)
		.limit(1);
	if (alreadySeeded) {
		return { branches: 0, accounts: 0 };
	}

	const [organization] = await db
		.insert(organizations)
		.values({ name: "Antros Club", owner_user_uid: ownerUid })
		.returning();

	const [centro, norte] = await db
		.insert(branches)
		.values([
			{
				organization_id: organization.id,
				name: "Sucursal Centro",
				code: "CENTRO",
				address: "Av. Reforma 120, Centro",
				phone: "55 5555 0101",
				// Comparte scope con el usuario demo: hereda los datos ya sembrados.
				data_scope_uid: ownerUid,
			},
			{
				organization_id: organization.id,
				name: "Sucursal Norte",
				code: "NORTE",
				address: "Av. Patriotismo 890, Norte",
				phone: "55 5555 0202",
				data_scope_uid: `${ownerUid}::norte`,
			},
		])
		.returning();

	await seedBranchData(norte.data_scope_uid, paymentMethodIds);

	const accounts: Array<{
		email: string;
		name: string;
		memberships: Array<{ branchId: number; role: string }>;
	}> = [
		{
			email: "gerente@example.com",
			name: "Gerente Centro",
			memberships: [{ branchId: centro.id, role: "manager" }],
		},
		{
			email: "cajero@example.com",
			name: "Cajero Centro",
			memberships: [{ branchId: centro.id, role: "cashier" }],
		},
		{
			email: "mesero@example.com",
			name: "Mesero Norte",
			// Solo en NORTE: sirve para comprobar que no ve nada de CENTRO.
			memberships: [{ branchId: norte.id, role: "server" }],
		},
		{
			email: "inventario@example.com",
			name: "Inventario Multi",
			// En ambas: sirve para probar el cambio de sucursal.
			memberships: [
				{ branchId: centro.id, role: "inventory" },
				{ branchId: norte.id, role: "inventory" },
			],
		},
		{
			email: "auditor@example.com",
			name: "Auditor Norte",
			memberships: [{ branchId: norte.id, role: "auditor" }],
		},
	];

	// El propietario entra a las dos sucursales.
	const memberships: Array<{
		branch_id: number;
		user_uid: string;
		role: string;
	}> = [
		{ branch_id: centro.id, user_uid: ownerUid, role: "owner" },
		{ branch_id: norte.id, user_uid: ownerUid, role: "owner" },
	];

	for (const account of accounts) {
		// La cuenta puede existir de una siembra anterior; registrarla otra vez
		// fallaria por correo duplicado.
		const [existing] = await db
			.select({ id: user.id })
			.from(user)
			.where(sql`${user.email} = ${account.email}`)
			.limit(1);
		const accountUid =
			existing?.id ??
			(
				await auth.api.signUpEmail({
					body: {
						name: account.name,
						email: account.email,
						password: DEMO_PASSWORD,
					},
				})
			).user.id;

		for (const membership of account.memberships) {
			memberships.push({
				branch_id: membership.branchId,
				user_uid: accountUid,
				role: membership.role,
			});
		}
	}

	await db.insert(branchMemberships).values(memberships);

	return { branches: 2, accounts: accounts.length + 1 };
}

/** Catalogo y ventas propias de una sucursal, para que no aparezca vacia. */
async function seedBranchData(scopeUid: string, paymentMethodIds: number[]) {
	const catalogue = DEMO_PRODUCTS.filter((product) =>
		["cervezas", "cocteles", "snacks"].includes(product.category),
	);

	const insertedProducts = await db
		.insert(products)
		.values(
			catalogue.map((product) => ({
				name: product.name,
				description: product.description,
				image_url: getProductImageUrl(product.category, product.name),
				price: product.price,
				in_stock: product.stock,
				user_uid: scopeUid,
				category: product.category,
			})),
		)
		.returning();

	const insertedCustomers = await db
		.insert(customers)
		.values(
			DEMO_CUSTOMERS.slice(0, 6).map(([name, email, phone]) => ({
				name,
				// El correo es unico por cliente: sin sufijo chocaria con CENTRO.
				email: `norte.${email}`,
				phone,
				user_uid: scopeUid,
				status: "active",
				created_at: faker.date.recent({ days: 60 }),
			})),
		)
		.returning();

	for (let index = 0; index < 12; index += 1) {
		const customer = faker.helpers.arrayElement(insertedCustomers);
		const items = faker.helpers.arrayElements(
			insertedProducts,
			faker.number.int({ min: 1, max: 4 }),
		);
		const total = items.reduce((sum, product) => sum + product.price, 0);
		const createdAt = faker.date.recent({ days: 30 });

		const [order] = await db
			.insert(orders)
			.values({
				customer_id: customer.id,
				total_amount: total,
				user_uid: scopeUid,
				status: "completed",
				created_at: createdAt,
			})
			.returning();

		await db.insert(orderItems).values(
			items.map((product) => ({
				order_id: order.id,
				product_id: product.id,
				quantity: 1,
				price: product.price,
			})),
		);

		await db.insert(transactions).values({
			description: `Venta Norte #${order.id}`,
			order_id: order.id,
			payment_method_id: faker.helpers.arrayElement(paymentMethodIds),
			amount: total,
			user_uid: scopeUid,
			type: "income",
			category: "selling",
			status: "completed",
			created_at: createdAt,
		});
	}
}

async function seedCities(): Promise<number> {
	const existingCities = await db
		.select({ count: sql<number>`count(*)` })
		.from(cities);

	if (existingCities[0].count > 0) return existingCities[0].count;

	let total = 0;

	for (const uf of STATES) {
		try {
			const res = await fetch(
				`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
			);
			if (!res.ok) {
				console.warn(`Failed to fetch cities for ${uf}: ${res.status}`);
				continue;
			}

			const data: Array<{ id: number; nome: string }> = await res.json();

			if (data.length > 0) {
				// Insert in batches of 500 to avoid query size limits
				for (let i = 0; i < data.length; i += 500) {
					const batch = data.slice(i, i + 500);
					await db.insert(cities).values(
						batch.map((city) => ({
							id: city.id,
							name: city.nome,
							state_code: uf,
						})),
					);
				}
				total += data.length;
			}
		} catch (err) {
			console.warn(`Error fetching cities for ${uf}:`, err);
		}
	}

	return total;
}
