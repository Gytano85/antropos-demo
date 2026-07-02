import { relations } from "drizzle-orm";
import {
	boolean,
	customType,
	integer,
	pgTable,
	real,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

// Re-export Better Auth tables so drizzle-kit picks them up
export {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./auth-schema";

// Custom bytea type for PGLite compatibility
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
});

// ── Products ────────────────────────────────────────────────────────────────
export const products = pgTable("products", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	image_url: text("image_url"),
	price: integer("price").notNull(),
	in_stock: integer("in_stock").notNull(),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	category: varchar("category", { length: 50 }),
	// Fiscal fields (optional, fallback to fiscal_settings defaults)
	ncm: varchar("ncm", { length: 8 }),
	cfop: varchar("cfop", { length: 4 }),
	icms_cst: varchar("icms_cst", { length: 3 }),
	pis_cst: varchar("pis_cst", { length: 2 }),
	cofins_cst: varchar("cofins_cst", { length: 2 }),
	unit_of_measure: varchar("unit_of_measure", { length: 6 }).default("UN"),
	created_at: timestamp("created_at").defaultNow(),
});

export const appSettings = pgTable("app_settings", {
	id: serial("id").primaryKey(),
	user_uid: varchar("user_uid", { length: 255 }).notNull().unique(),
	company_title: varchar("company_title", { length: 120 })
		.notNull()
		.default("Antro POS"),
	primary_color: varchar("primary_color", { length: 20 })
		.notNull()
		.default("#111827"),
	accent_color: varchar("accent_color", { length: 20 })
		.notNull()
		.default("#f59e0b"),
	background_color: varchar("background_color", { length: 20 })
		.notNull()
		.default("#ffffff"),
	card_color: varchar("card_color", { length: 20 })
		.notNull()
		.default("#ffffff"),
	text_color: varchar("text_color", { length: 20 })
		.notNull()
		.default("#111827"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

export const restockingSettings = pgTable("restocking_settings", {
	id: serial("id").primaryKey(),
	user_uid: varchar("user_uid", { length: 255 }).notNull().unique(),
	history_days: integer("history_days").notNull().default(30),
	lead_time_days: integer("lead_time_days").notNull().default(7),
	coverage_days: integer("coverage_days").notNull().default(14),
	safety_stock_pct: integer("safety_stock_pct").notNull().default(25),
	urgent_days: integer("urgent_days").notNull().default(3),
	soon_days: integer("soon_days").notNull().default(7),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// ── Customers ───────────────────────────────────────────────────────────────
export const customers = pgTable("customers", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	phone: varchar("phone", { length: 20 }),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	status: varchar("status", { length: 20 }),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Orders ──────────────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
	id: serial("id").primaryKey(),
	customer_id: integer("customer_id").references(() => customers.id),
	table_name: varchar("table_name", { length: 50 }),
	total_amount: integer("total_amount").notNull(),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	status: varchar("status", { length: 20 }),
	created_at: timestamp("created_at").defaultNow(),
	closed_at: timestamp("closed_at"),
	party_size: integer("party_size").notNull().default(1),
});

// ── Order Items ─────────────────────────────────────────────────────────────
export const orderItems = pgTable("order_items", {
	id: serial("id").primaryKey(),
	order_id: integer("order_id").references(() => orders.id),
	product_id: integer("product_id").references(() => products.id),
	quantity: integer("quantity").notNull(),
	price: integer("price").notNull(),
	created_at: timestamp("created_at").defaultNow(),
});

// Ingredients are stored in their smallest practical unit:
// ml for liquids, g for food, and unit for countable supplies.
export const ingredients = pgTable("ingredients", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	unit: varchar("unit", { length: 20 }).notNull(),
	stock_quantity: real("stock_quantity").notNull().default(0),
	package_size: real("package_size").notNull().default(1),
	low_stock_threshold: real("low_stock_threshold").notNull().default(0),
	shelf_life_days: real("shelf_life_days"),
	opened_days: real("opened_days"),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

export const recipes = pgTable("recipes", {
	id: serial("id").primaryKey(),
	product_id: integer("product_id")
		.references(() => products.id)
		.notNull(),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

export const recipeItems = pgTable("recipe_items", {
	id: serial("id").primaryKey(),
	recipe_id: integer("recipe_id")
		.references(() => recipes.id)
		.notNull(),
	ingredient_id: integer("ingredient_id")
		.references(() => ingredients.id)
		.notNull(),
	quantity: real("quantity").notNull(),
	created_at: timestamp("created_at").defaultNow(),
});

export const ingredientMovements = pgTable("ingredient_movements", {
	id: serial("id").primaryKey(),
	ingredient_id: integer("ingredient_id")
		.references(() => ingredients.id)
		.notNull(),
	order_id: integer("order_id"),
	order_item_id: integer("order_item_id"),
	movement_type: varchar("movement_type", { length: 30 }).notNull(),
	quantity: real("quantity").notNull(),
	expected_quantity: real("expected_quantity"),
	notes: text("notes"),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	created_at: timestamp("created_at").defaultNow(),
});

export const ingredientCounts = pgTable("ingredient_counts", {
	id: serial("id").primaryKey(),
	ingredient_id: integer("ingredient_id")
		.references(() => ingredients.id)
		.notNull(),
	expected_quantity: real("expected_quantity").notNull(),
	counted_quantity: real("counted_quantity").notNull(),
	variance_quantity: real("variance_quantity").notNull(),
	variance_percent: real("variance_percent").notNull(),
	exceeds_tolerance: boolean("exceeds_tolerance").notNull().default(false),
	notes: text("notes"),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Payment Methods ─────────────────────────────────────────────────────────
export const paymentMethods = pgTable("payment_methods", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 50 }).notNull().unique(),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Transactions ────────────────────────────────────────────────────────────
export const transactions = pgTable("transactions", {
	id: serial("id").primaryKey(),
	description: text("description"),
	order_id: integer("order_id").references(() => orders.id),
	payment_method_id: integer("payment_method_id").references(
		() => paymentMethods.id,
	),
	amount: integer("amount").notNull(),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	type: varchar("type", { length: 20 }),
	category: varchar("category", { length: 100 }),
	status: varchar("status", { length: 20 }),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Cities (IBGE) ──────────────────────────────────────────────────────────
export const cities = pgTable("cities", {
	id: integer("id").primaryKey(), // IBGE code (7 digits)
	name: varchar("name", { length: 120 }).notNull(),
	state_code: varchar("state_code", { length: 2 }).notNull(),
});

// ── Fiscal Settings ────────────────────────────────────────────────────────
export const fiscalSettings = pgTable("fiscal_settings", {
	id: serial("id").primaryKey(),
	user_uid: varchar("user_uid", { length: 255 }).notNull().unique(),
	// Company identity
	company_name: varchar("company_name", { length: 255 }).notNull(),
	trade_name: varchar("trade_name", { length: 255 }),
	tax_id: varchar("tax_id", { length: 14 }).notNull(), // CNPJ
	state_tax_id: varchar("state_tax_id", { length: 20 }).notNull(), // IE
	tax_regime: integer("tax_regime").notNull(), // CRT: 1=Simples, 2=Simples excess, 3=Normal
	// Address
	state_code: varchar("state_code", { length: 2 }).notNull(), // UF
	city_code: varchar("city_code", { length: 7 }).notNull(), // IBGE code
	city_name: varchar("city_name", { length: 100 }).notNull(),
	street: varchar("street", { length: 255 }).notNull(),
	street_number: varchar("street_number", { length: 10 }).notNull(),
	district: varchar("district", { length: 100 }).notNull(),
	zip_code: varchar("zip_code", { length: 8 }).notNull(),
	address_complement: varchar("address_complement", { length: 100 }),
	// Environment & numbering
	environment: integer("environment").notNull().default(2), // 1=production, 2=homologation
	nfe_series: integer("nfe_series").default(1),
	nfce_series: integer("nfce_series").default(1),
	next_nfe_number: integer("next_nfe_number").default(1),
	next_nfce_number: integer("next_nfce_number").default(1),
	// NFC-e security code
	csc_id: varchar("csc_id", { length: 10 }),
	csc_token: varchar("csc_token", { length: 50 }),
	// Certificate
	certificate_pfx: bytea("certificate_pfx"),
	certificate_password: text("certificate_password"),
	certificate_valid_until: timestamp("certificate_valid_until"),
	// Default fiscal fields (fallback when product doesn't have them)
	default_ncm: varchar("default_ncm", { length: 8 }).default("00000000"),
	default_cfop: varchar("default_cfop", { length: 4 }).default("5102"),
	default_icms_cst: varchar("default_icms_cst", { length: 3 }).default("00"),
	default_pis_cst: varchar("default_pis_cst", { length: 2 }).default("99"),
	default_cofins_cst: varchar("default_cofins_cst", { length: 2 }).default(
		"99",
	),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// ── Dynamic alcohol pricing settings ───────────────────────────────────────
export const pricingSettings = pgTable("pricing_settings", {
	id: serial("id").primaryKey(),
	user_uid: varchar("user_uid", { length: 255 }).notNull().unique(),
	enabled: boolean("enabled").notNull().default(true),
	// Cuántas mesas abiertas se consideran "lleno" (100% de ocupación)
	capacity: integer("capacity").notNull().default(15),
	// % de ajuste sobre el precio base con 0 mesas abiertas (negativo = descuento)
	min_adjustment_pct: integer("min_adjustment_pct").notNull().default(-15),
	// % de ajuste sobre el precio base con ocupación al 100% (positivo = recargo)
	max_adjustment_pct: integer("max_adjustment_pct").notNull().default(25),
	// Bebidas alcohólicas por persona a partir de las cuales se considera posible exceso
	drunk_threshold: real("drunk_threshold").notNull().default(3),
	// % extra de recargo cuando se detecta posible exceso
	drunk_surge_pct: integer("drunk_surge_pct").notNull().default(20),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// ── Invoices (NF-e / NFC-e) ────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
	id: serial("id").primaryKey(),
	user_uid: varchar("user_uid", { length: 255 }).notNull(),
	order_id: integer("order_id").references(() => orders.id),
	model: integer("model").notNull(), // 55=NF-e, 65=NFC-e
	series: integer("series").notNull(),
	number: integer("number").notNull(),
	access_key: varchar("access_key", { length: 44 }),
	operation_nature: varchar("operation_nature", { length: 60 }).default(
		"VENDA",
	),
	operation_type: integer("operation_type").default(1), // 0=inbound, 1=outbound
	status: varchar("status", { length: 20 }).default("pending").notNull(),
	// pending | authorized | rejected | cancelled | denied | contingency | voided
	environment: integer("environment").notNull(), // 1=production, 2=homologation
	// XML payloads
	request_xml: text("request_xml"),
	response_xml: text("response_xml"),
	protocol_xml: text("protocol_xml"), // procNFe = NFe + protNFe
	// SEFAZ response
	protocol_number: varchar("protocol_number", { length: 20 }),
	status_code: integer("status_code"), // cStat
	status_message: text("status_message"), // xMotivo
	// Dates
	issued_at: timestamp("issued_at").notNull(),
	authorized_at: timestamp("authorized_at"),
	// Totals
	total_amount: integer("total_amount").notNull(), // cents
	// Contingency
	is_contingency: boolean("is_contingency").default(false),
	contingency_type: varchar("contingency_type", { length: 20 }),
	contingency_at: timestamp("contingency_at"),
	contingency_reason: text("contingency_reason"),
	// Recipient
	recipient_tax_id: varchar("recipient_tax_id", { length: 14 }),
	recipient_name: varchar("recipient_name", { length: 255 }),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Invoice Items ──────────────────────────────────────────────────────────
export const invoiceItems = pgTable("invoice_items", {
	id: serial("id").primaryKey(),
	invoice_id: integer("invoice_id")
		.references(() => invoices.id)
		.notNull(),
	product_id: integer("product_id").references(() => products.id),
	item_number: integer("item_number").notNull(),
	product_code: varchar("product_code", { length: 60 }).notNull(),
	description: varchar("description", { length: 120 }).notNull(),
	ncm: varchar("ncm", { length: 8 }).notNull(),
	cfop: varchar("cfop", { length: 4 }).notNull(),
	unit_of_measure: varchar("unit_of_measure", { length: 6 }).default("UN"),
	quantity: integer("quantity").notNull(), // x1000 (3 decimal places)
	unit_price: integer("unit_price").notNull(), // cents
	total_price: integer("total_price").notNull(), // cents
	icms_cst: varchar("icms_cst", { length: 3 }),
	icms_rate: integer("icms_rate").default(0), // x100
	icms_amount: integer("icms_amount").default(0),
	pis_cst: varchar("pis_cst", { length: 2 }),
	cofins_cst: varchar("cofins_cst", { length: 2 }),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Invoice Events (cancellation, voiding, etc.) ───────────────────────────
export const invoiceEvents = pgTable("invoice_events", {
	id: serial("id").primaryKey(),
	invoice_id: integer("invoice_id")
		.references(() => invoices.id)
		.notNull(),
	event_type: varchar("event_type", { length: 30 }).notNull(),
	sequence: integer("sequence").default(1),
	protocol_number: varchar("protocol_number", { length: 20 }),
	status_code: integer("status_code"),
	reason: text("reason"),
	request_xml: text("request_xml"),
	response_xml: text("response_xml"),
	created_at: timestamp("created_at").defaultNow(),
});

// ── Relations ───────────────────────────────────────────────────────────────
export const ordersRelations = relations(orders, ({ one, many }) => ({
	customer: one(customers, {
		fields: [orders.customer_id],
		references: [customers.id],
	}),
	orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	order: one(orders, {
		fields: [orderItems.order_id],
		references: [orders.id],
	}),
	product: one(products, {
		fields: [orderItems.product_id],
		references: [products.id],
	}),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
	order: one(orders, {
		fields: [transactions.order_id],
		references: [orders.id],
	}),
	paymentMethod: one(paymentMethods, {
		fields: [transactions.payment_method_id],
		references: [paymentMethods.id],
	}),
}));

export const customersRelations = relations(customers, ({ many }) => ({
	orders: many(orders),
}));

export const productsRelations = relations(products, ({ many }) => ({
	orderItems: many(orderItems),
	recipes: many(recipes),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
	recipeItems: many(recipeItems),
	movements: many(ingredientMovements),
	counts: many(ingredientCounts),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	product: one(products, {
		fields: [recipes.product_id],
		references: [products.id],
	}),
	items: many(recipeItems),
}));

export const recipeItemsRelations = relations(recipeItems, ({ one }) => ({
	recipe: one(recipes, {
		fields: [recipeItems.recipe_id],
		references: [recipes.id],
	}),
	ingredient: one(ingredients, {
		fields: [recipeItems.ingredient_id],
		references: [ingredients.id],
	}),
}));

export const ingredientMovementsRelations = relations(
	ingredientMovements,
	({ one }) => ({
		ingredient: one(ingredients, {
			fields: [ingredientMovements.ingredient_id],
			references: [ingredients.id],
		}),
	}),
);

export const ingredientCountsRelations = relations(
	ingredientCounts,
	({ one }) => ({
		ingredient: one(ingredients, {
			fields: [ingredientCounts.ingredient_id],
			references: [ingredients.id],
		}),
	}),
);

export const paymentMethodsRelations = relations(
	paymentMethods,
	({ many }) => ({
		transactions: many(transactions),
	}),
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
	order: one(orders, {
		fields: [invoices.order_id],
		references: [orders.id],
	}),
	items: many(invoiceItems),
	events: many(invoiceEvents),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
	invoice: one(invoices, {
		fields: [invoiceItems.invoice_id],
		references: [invoices.id],
	}),
	product: one(products, {
		fields: [invoiceItems.product_id],
		references: [products.id],
	}),
}));

export const invoiceEventsRelations = relations(invoiceEvents, ({ one }) => ({
	invoice: one(invoices, {
		fields: [invoiceEvents.invoice_id],
		references: [invoices.id],
	}),
}));
