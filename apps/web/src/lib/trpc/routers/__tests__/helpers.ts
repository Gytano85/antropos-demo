import { PGlite } from "@electric-sql/pglite";
import { getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

// FK-safe order: referenced tables before referencing tables
const TABLES: PgTable[] = [
	schema.products,
	schema.customers,
	schema.paymentMethods,
	schema.orders,
	schema.orderItems,
	// El router de ordenes descuenta inventario por receta al vender. Sin estas
	// tablas la consulta fallaba con 'relation "recipe_items" does not exist' y
	// toda la suite de ordenes quedaba en rojo.
	schema.ingredients,
	schema.recipes,
	schema.recipeItems,
	schema.ingredientMovements,
	schema.transactions,
	schema.appSettings,
	schema.cities,
	schema.fiscalSettings,
	schema.invoices,
	schema.invoiceItems,
	schema.invoiceEvents,
];

/** Traduce el default de drizzle a SQL, o null si no se puede representar. */
function defaultLiteral(value: unknown, sqlType: string): string | null {
	if (sqlType.startsWith("timestamp")) return "NOW()";
	if (value === undefined || value === null) return null;
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
	return null;
}

function tableToDDL(table: PgTable): string {
	const { name, columns, foreignKeys, indexes } = getTableConfig(table);

	const colDefs = columns.map((col) => {
		const sqlType = col.getSQLType();
		const isSerial = sqlType === "serial";
		const parts: string[] = [col.name, sqlType];

		if (col.primary) parts.push("PRIMARY KEY");
		if (col.notNull && !isSerial) parts.push("NOT NULL");
		if (col.isUnique) parts.push("UNIQUE");
		// Antes solo se copiaban los defaults de timestamp. Una columna NOT NULL con
		// default de otro tipo (party_size, por ejemplo) quedaba sin el, y cualquier
		// insert que se apoyara en ese default fallaba con "violates not-null".
		if (col.hasDefault && !isSerial) {
			const literal = defaultLiteral(col.default, sqlType);
			if (literal !== null) parts.push(`DEFAULT ${literal}`);
		}

		return parts.join(" ");
	});

	const fkDefs = foreignKeys.map((fk) => {
		const ref = fk.reference();
		const col = ref.columns[0].name;
		const refTable = getTableName(ref.foreignColumns[0].table);
		const refCol = ref.foreignColumns[0].name;
		return `FOREIGN KEY (${col}) REFERENCES ${refTable}(${refCol})`;
	});

	// Los indices unicos declarados a nivel de tabla (por ejemplo, nombre unico
	// por cuenta) no son columnas. Sin emitirlos, las pruebas corrian sin esa
	// restriccion y daban por buenos duplicados que la base real rechaza.
	const uniqueIndexDefs = indexes
		.filter((index) => index.config.unique)
		.map((index) => {
			const cols = index.config.columns
				.map((col) => ("name" in col ? col.name : String(col)))
				.join(", ");
			return `CREATE UNIQUE INDEX IF NOT EXISTS ${index.config.name} ON ${name} (${cols});`;
		});

	const create = `CREATE TABLE IF NOT EXISTS ${name} (\n  ${[...colDefs, ...fkDefs].join(",\n  ")}\n);`;
	return [create, ...uniqueIndexDefs].join("\n");
}

export const SCHEMA_DDL = TABLES.map(tableToDDL).join("\n\n");

export function createTestDb() {
	const pg = new PGlite();
	const db = drizzle({ client: pg, schema });
	return { pg, db };
}

export function makeUser(id: string) {
	return {
		id,
		name: "Test",
		email: `${id}@test.com`,
		emailVerified: false,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}
