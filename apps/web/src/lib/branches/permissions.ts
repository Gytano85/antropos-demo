export const BRANCH_PERMISSIONS = [
	"dashboard.view",
	"sales.view",
	"sales.manage",
	"inventory.view",
	"inventory.manage",
	"menu.view",
	"menu.manage",
	"customers.manage",
	"attendance.view",
	"attendance.manage",
	"cameras.view",
	"cameras.manage",
	"reports.view",
	"fiscal.manage",
	"settings.manage",
	"branches.manage",
] as const;

export type BranchPermission = (typeof BRANCH_PERMISSIONS)[number];

export const BRANCH_ROLES = [
	"owner",
	"admin",
	"manager",
	"cashier",
	"server",
	"inventory",
	"auditor",
] as const;

export type BranchRole = (typeof BRANCH_ROLES)[number];

export const ROLE_LABELS: Record<BranchRole, string> = {
	owner: "Propietario",
	admin: "Administrador",
	manager: "Gerente",
	cashier: "Cajero",
	server: "Mesero",
	inventory: "Inventario",
	auditor: "Auditor",
};

export const PERMISSION_LABELS: Record<BranchPermission, string> = {
	"dashboard.view": "Ver panel",
	"sales.view": "Ver comandas, pedidos y caja",
	"sales.manage": "Abrir, modificar y cerrar comandas",
	"inventory.view": "Ver inventario, recetas y calidad",
	"inventory.manage": "Modificar inventario, recetas y reabasto",
	"menu.view": "Ver menú y motor de menú",
	"menu.manage": "Configurar menú y promociones",
	"customers.manage": "Administrar clientes",
	"attendance.view": "Ver asistencia",
	"attendance.manage": "Administrar empleados y turnos",
	"cameras.view": "Ver cámaras y eventos",
	"cameras.manage": "Configurar cámaras y básculas",
	"reports.view": "Ver reportes y auditorías",
	"fiscal.manage": "Administrar facturación",
	"settings.manage": "Cambiar configuración de la sucursal",
	"branches.manage": "Administrar sucursales, usuarios y roles",
};

const all = [...BRANCH_PERMISSIONS];

export const DEFAULT_ROLE_PERMISSIONS: Record<BranchRole, BranchPermission[]> = {
	owner: all,
	admin: all,
	manager: all.filter((permission) => permission !== "branches.manage"),
	cashier: [
		"dashboard.view",
		"sales.view",
		"sales.manage",
		"customers.manage",
	],
	server: ["sales.view", "sales.manage", "menu.view"],
	inventory: [
		"dashboard.view",
		"inventory.view",
		"inventory.manage",
		"menu.view",
		"menu.manage",
		"reports.view",
	],
	auditor: [
		"dashboard.view",
		"inventory.view",
		"attendance.view",
		"cameras.view",
		"reports.view",
	],
};

export function permissionsForRole(
	role: string,
	override?: string | null,
): BranchPermission[] {
	if (override) {
		try {
			const parsed = JSON.parse(override);
			if (Array.isArray(parsed)) {
				return parsed.filter((permission): permission is BranchPermission =>
					BRANCH_PERMISSIONS.includes(permission),
				);
			}
		} catch {
			// A malformed override must never grant extra permissions.
			return [];
		}
	}

	return DEFAULT_ROLE_PERMISSIONS[role as BranchRole] ?? [];
}

