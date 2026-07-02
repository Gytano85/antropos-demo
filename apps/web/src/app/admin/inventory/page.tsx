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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@finopenpos/ui/components/dialog";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@finopenpos/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	ArchiveRestoreIcon,
	BellIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClipboardCheckIcon,
	FlaskConicalIcon,
	PackageCheckIcon,
	PackageIcon,
	PlusIcon,
	SaveIcon,
	ShieldCheckIcon,
	Trash2Icon,
	TruckIcon,
	type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import Products from "@/app/admin/products/page";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";

type RecipesOverview = RouterOutputs["recipes"]["overview"];
type Ingredient = RecipesOverview["ingredients"][number];
type TabId = "products" | "restocking" | "recipes" | "audit" | "quality" | "alerts";

const tabs: {
	id: TabId;
	label: string;
	description: string;
	icon: LucideIcon;
}[] = [
	{ id: "products", label: "Inventario", description: "Productos y existencias", icon: PackageIcon },
	{ id: "restocking", label: "Reabastecimiento", description: "Compras automáticas", icon: TruckIcon },
	{ id: "recipes", label: "Recetas", description: "Consumo por venta", icon: FlaskConicalIcon },
	{ id: "audit", label: "Auditoría", description: "Supuesto vs real", icon: ShieldCheckIcon },
	{ id: "quality", label: "Calidad", description: "Vida útil y ajustes", icon: PackageCheckIcon },
	{ id: "alerts", label: "Alertas", description: "Pendientes operativos", icon: BellIcon },
];

const restockingDemoRows = [
	{ product: "Red Bull", category: "Energéticas", stock: "92 u.", demand: "38 u. / noche", leadTime: "2 días", coverage: "2.4 noches", target: "160 u.", order: "72 u.", status: "Compra automática", severity: "critical", reason: "Alta rotación de fin de semana" },
	{ product: "Don Julio 70", category: "Botellas VIP", stock: "7.6 botellas", demand: "3.1 botellas / noche", leadTime: "3 días", coverage: "2.5 noches", target: "18 botellas", order: "2 cajas", status: "Preparar orden", severity: "warning", reason: "Stock por debajo del nivel ideal" },
	{ product: "Limón", category: "Insumos", stock: "8.4 kg", demand: "2.8 kg / noche", leadTime: "1 día", coverage: "3 noches", target: "14 kg", order: "6 kg", status: "Compra próxima", severity: "warning", reason: "Uso alto en coctelería" },
	{ product: "Corona Extra", category: "Cervezas", stock: "95 u.", demand: "22 u. / noche", leadTime: "2 días", coverage: "4.3 noches", target: "120 u.", order: "0 u.", status: "Suficiente", severity: "ok", reason: "Cobertura correcta" },
];

const auditRows = [
	{ product: "Vodka", sold: "100 Azulitos", expected: "4,500 ml", counted: "4,850 ml", quality: "100 ml", final: "250 ml", range: "5.5%", tolerance: "7%", status: "Dentro de rango", severity: "ok" },
	{ product: "Red Bull", sold: "80 servicios + 30 individuales", expected: "110 u.", counted: "95 u.", quality: "2 u.", final: "13 u.", range: "11.8%", tolerance: "3%", status: "Fuera de rango", severity: "critical" },
	{ product: "Don Julio 70", sold: "8 servicios", expected: "5,600 ml", counted: "5,320 ml", quality: "0 ml", final: "280 ml", range: "5.0%", tolerance: "7%", status: "Dentro de rango", severity: "ok" },
	{ product: "Limón", sold: "Cocteles + botellas", expected: "3.8 kg", counted: "5.2 kg", quality: "1.0 kg", final: "0.4 kg", range: "10.5%", tolerance: "8%", status: "Revisar conteo", severity: "warning" },
];

const qualityRows = [
	{ product: "Jugo de piña", group: "Mezcladores", status: "En revisión", opened: "Hace 4 días", idealWindow: "48 horas", expiration: "3 días abierto", authorized: "350 ml", covered: "350 ml", owner: "Supervisor barra", severity: "warning" },
	{ product: "Limón", group: "Insumos", status: "Fuera de ventana ideal", opened: "Hace 5 días", idealWindow: "3 días", expiration: "7 días refrigerado", authorized: "1.0 kg", covered: "1.0 kg", owner: "Cocina", severity: "warning" },
	{ product: "Vodka abierto", group: "Alcohol", status: "Correcto", opened: "Hace 11 días", idealWindow: "30 días", expiration: "60 días abierto", authorized: "0 ml", covered: "0 ml", owner: "Barra principal", severity: "ok" },
	{ product: "Alitas BBQ", group: "Alimentos", status: "Fuera de estándar", opened: "Hace 3 días", idealWindow: "48 horas", expiration: "4 días refrigerado", authorized: "8 porciones", covered: "8 porciones", owner: "Cocina", severity: "critical" },
];

const alertRows = [
	{ type: "Auditoría", title: "Red Bull fuera de rango", detail: "Diferencia final de 13 unidades después de considerar ajustes autorizados.", level: "Crítica", impact: "$533 costo estimado", tab: "audit" as TabId },
	{ type: "Calidad", title: "Alitas BBQ fuera de estándar", detail: "Revisión abierta con 8 porciones registradas.", level: "Alta", impact: "$608 costo estimado", tab: "quality" as TabId },
	{ type: "Reabastecimiento", title: "Red Bull en compra automática", detail: "La regla actual calcula 72 unidades para regresar a nivel ideal.", level: "Media", impact: "2.4 noches de cobertura", tab: "restocking" as TabId },
	{ type: "Recetas", title: "Pack Precopeo incompleto", detail: "Falta completar un componente del combo para cerrar auditoría.", level: "Media", impact: "1 receta", tab: "recipes" as TabId },
];

export default function InventoryPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selected = (searchParams.get("tab") || "products") as TabId;
	const active = tabs.some((tab) => tab.id === selected) ? selected : "products";

	const selectTab = (tab: TabId) => {
		router.replace(`/admin/inventory?tab=${tab}`, { scroll: false });
	};

	return (
		<div className="space-y-5">
			<div className="rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<div className="flex items-center gap-2">
							<ClipboardCheckIcon className="h-6 w-6 text-primary" />
							<h2 className="font-bold text-2xl">Inventario y Control</h2>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							Inventario, compras, recetas, auditoría, calidad y alertas en un solo flujo.
						</p>
					</div>
					<Badge variant="outline" className="w-fit">
						Tolerancia configurable por producto
					</Badge>
				</div>
			</div>

			<div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{tabs.map(({ id, label, description, icon: Icon }) => (
					<Button
						key={id}
						type="button"
						variant={active === id ? "default" : "ghost"}
						className="h-auto justify-start gap-3 px-3 py-3 text-left"
						onClick={() => selectTab(id)}
					>
						<Icon className="h-5 w-5 shrink-0" />
						<span className="min-w-0">
							<span className="block font-medium">{label}</span>
							<span className="block truncate text-xs opacity-80">{description}</span>
						</span>
					</Button>
				))}
			</div>

			{active === "products" && <Products />}
			{active === "restocking" && <RestockingSection />}
			{active === "recipes" && <RecipesSection />}
			{active === "audit" && <AuditSection />}
			{active === "quality" && <QualitySection />}
			{active === "alerts" && <AlertsSection onSelectTab={selectTab} />}
		</div>
	);
}

function RestockingSection() {
	const trpc = useTRPC();
	const { data } = useQuery(
		trpc.restocking.recommendations.queryOptions({
			historyDays: 30,
			leadTimeDays: 7,
			coverageDays: 14,
			safetyStockPct: 25,
			urgentDays: 3,
			soonDays: 7,
		}),
	);
	const rows =
		data?.items.map((item) => ({
			product: item.name,
			category: item.category ?? "Sin categoría",
			stock: String(item.currentStock),
			demand: item.averageDailyDemand > 0 ? `${item.averageDailyDemand}/día` : "Sin demanda",
			leadTime: `${data.settings.leadTimeDays} días`,
			coverage: item.daysRemaining === null ? "—" : `${item.daysRemaining} días`,
			target: String(item.targetStock),
			order: item.recommendedQuantity > 0 ? String(item.recommendedQuantity) : "—",
			status:
				item.status === "urgent"
					? "Compra urgente"
					: item.status === "soon"
						? "Stock bajo"
						: item.status === "healthy"
							? "En stock"
							: "Sin movimiento",
			severity:
				item.status === "urgent"
					? "critical"
					: item.status === "soon"
						? "warning"
						: "ok",
			reason:
				item.recommendedQuantity > 0
					? `Comprar ${item.recommendedQuantity}`
					: "Sin compra",
		})) ?? restockingDemoRows;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-4">
				<MetricCard icon={TruckIcon} label="Productos analizados" value={data?.totalProducts ?? 32} detail="Lógica real" accent="text-blue-600" />
				<MetricCard icon={AlertTriangleIcon} label="Compra urgente" value={data?.urgentCount ?? 1} detail="Regla activa" accent="text-red-600" />
				<MetricCard icon={CalendarClockIcon} label="Reordenar pronto" value={data?.soonCount ?? 2} detail="Cobertura baja" accent="text-amber-600" />
				<MetricCard icon={CheckCircle2Icon} label="Unidades sugeridas" value={data?.recommendedUnits ?? 72} detail="Compra calculada" accent="text-emerald-600" />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Reglas de reabastecimiento automático</CardTitle>
					<CardDescription>
						Calcula compra por consumo reciente, cobertura deseada, tiempo de proveedor y nivel ideal.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<RuleCard title="Cobertura deseada" lines={["Viernes y sábado: 4 noches", "Entre semana: 2 noches"]} />
					<RuleCard title="Proveedor" lines={["Tiempo de entrega por producto", "Compra en cajas o unidades"]} />
					<RuleCard title="Nivel ideal" lines={["Stock mínimo", "Stock ideal", "Reserva operativa"]} />
					<RuleCard title="Automatización" lines={["Crear orden borrador", "Requiere autorización", "Agrupar por proveedor"]} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Compra calculada</CardTitle>
					<CardDescription>
						Ejemplo de cómo debe leerse el reabastecimiento automático en operación.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<RestockingTable rows={rows} />
				</CardContent>
			</Card>
		</div>
	);
}

function RecipesSection() {
	return (
		<div className="space-y-6">
			<RecipeEditor />
		</div>
	);
}

function RecipeEditor() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data } = useQuery(trpc.recipes.overview.queryOptions());
	const [productId, setProductId] = useState<number | null>(null);
	const [ingredientId, setIngredientId] = useState<number | null>(null);
	const [quantity, setQuantity] = useState(0);
	const [draft, setDraft] = useState<{ ingredientId: number; quantity: number }[]>([]);
	const [newIngredientName, setNewIngredientName] = useState("");
	const [newIngredientUnit, setNewIngredientUnit] = useState<"ml" | "g" | "unit">("ml");
	const [editingIngredientId, setEditingIngredientId] = useState<number | null>(null);
	const [ingredientForm, setIngredientForm] = useState({
		name: "",
		unit: "ml" as "ml" | "g" | "unit",
		packageSize: 750,
		lowStockThreshold: 750,
	});

	const selectedRecipe = useMemo(
		() => data?.recipes.find((recipe) => recipe.product_id === productId),
		[data, productId],
	);
	const selectedProduct = data?.products.find((product) => product.id === productId);
	const selectedIngredient = data?.ingredients.find((ingredient) => ingredient.id === editingIngredientId);
	const recipesByProduct = useMemo(
		() => new Map(data?.recipes.map((recipe) => [recipe.product_id, recipe]) ?? []),
		[data?.recipes],
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries(trpc.recipes.overview.queryOptions());
		await queryClient.invalidateQueries(trpc.recipes.warnings.queryOptions());
	};

	const saveRecipe = useMutation(
		trpc.recipes.saveRecipe.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Receta guardada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const deleteRecipe = useMutation(
		trpc.recipes.deleteRecipe.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setDraft([]);
				setProductId(null);
				toast.success("Receta eliminada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const createIngredient = useMutation(
		trpc.recipes.createIngredient.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setNewIngredientName("");
				toast.success("Ingrediente creado");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateIngredient = useMutation(
		trpc.recipes.updateIngredient.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Ingrediente actualizado");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const selectProduct = (value: string) => {
		const id = Number(value);
		setProductId(id);
		const recipe = data?.recipes.find((item) => item.product_id === id);
		setDraft(
			recipe?.items.map((item) => ({
				ingredientId: item.ingredient_id,
				quantity: item.quantity,
			})) ?? [],
		);
	};
	const startEditingIngredient = (ingredient: Ingredient) => {
		setEditingIngredientId(ingredient.id);
		setIngredientForm({
			name: ingredient.name,
			unit: ingredient.unit as "ml" | "g" | "unit",
			packageSize: ingredient.package_size,
			lowStockThreshold: ingredient.low_stock_threshold,
		});
	};

	const addIngredient = () => {
		if (!ingredientId || quantity <= 0) return;
		setDraft((current) => {
			const existing = current.find((item) => item.ingredientId === ingredientId);
			if (existing) {
				return current.map((item) =>
					item.ingredientId === ingredientId ? { ...item, quantity } : item,
				);
			}
			return [...current, { ingredientId, quantity }];
		});
		setIngredientId(null);
		setQuantity(0);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Editor de recetas</CardTitle>
				<CardDescription>
					Configura los componentes que descuenta cada venta y las unidades de inventario que usa cada ingrediente.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-4 xl:grid-cols-[0.85fr_1.3fr_0.85fr]">
					<div className="space-y-3 rounded-xl border p-4">
						<div>
							<p className="font-semibold">Productos</p>
							<p className="text-muted-foreground text-sm">Selecciona uno para editar su receta.</p>
						</div>
						<div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
							{data?.products.map((product) => {
								const recipe = recipesByProduct.get(product.id);
								const itemCount = recipe?.items.length ?? 0;
								const active = product.id === productId;
								return (
									<button
										key={product.id}
										type="button"
										onClick={() => selectProduct(String(product.id))}
										className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-primary/50 ${
											active ? "border-primary bg-primary/5" : "bg-background"
										}`}
									>
										<div className="flex items-center justify-between gap-3">
											<div>
												<p className="font-medium">{product.name}</p>
												<p className="text-muted-foreground text-xs">{product.category ?? "sin categoría"}</p>
											</div>
											<span className="text-muted-foreground text-xs">
												{itemCount} comp.
											</span>
										</div>
									</button>
								);
							})}
						</div>
					</div>

					<div className="space-y-4 rounded-xl border p-4">
						<div className="space-y-2">
							<Label>Producto vendible</Label>
							<Select value={productId ? String(productId) : undefined} onValueChange={selectProduct}>
								<SelectTrigger>
									<SelectValue placeholder="Seleccionar producto" />
								</SelectTrigger>
								<SelectContent>
									{data?.products.map((product) => (
										<SelectItem key={product.id} value={String(product.id)}>
											{product.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{selectedProduct && (
							<div className="rounded-lg bg-muted/40 px-3 py-2">
								<p className="font-semibold">{selectedProduct.name}</p>
								<p className="text-muted-foreground text-sm">
									{selectedRecipe ? "Editando receta existente" : "Nueva receta"}
								</p>
							</div>
						)}

						<div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
							<Select value={ingredientId ? String(ingredientId) : undefined} onValueChange={(value) => setIngredientId(Number(value))}>
								<SelectTrigger>
									<SelectValue placeholder="Ingrediente" />
								</SelectTrigger>
								<SelectContent>
									{data?.ingredients.map((ingredient) => (
										<SelectItem key={ingredient.id} value={String(ingredient.id)}>
											{ingredient.name} ({unitLabel(ingredient)})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} placeholder="Cantidad" />
							<Button type="button" variant="outline" onClick={addIngredient} disabled={!productId || !ingredientId || quantity <= 0}>
								<PlusIcon className="mr-2 h-4 w-4" />
								Agregar
							</Button>
						</div>

						<div className="overflow-x-auto rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Ingrediente</TableHead>
										<TableHead className="text-right">Cantidad por venta</TableHead>
										<TableHead className="w-12" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{draft.map((item) => {
										const ingredient = data?.ingredients.find((i) => i.id === item.ingredientId);
										return (
											<TableRow key={item.ingredientId}>
												<TableCell>{ingredient?.name}</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-2">
														<Input
															type="number"
															min="0"
															step="0.01"
															className="h-8 w-28 text-right"
															value={item.quantity}
															onChange={(event) =>
																setDraft((current) =>
																	current.map((component) =>
																		component.ingredientId === item.ingredientId
																			? { ...component, quantity: Number(event.target.value) }
																			: component,
																	),
																)
															}
														/>
														<span className="w-12 text-muted-foreground text-sm">
															{ingredient ? unitLabel(ingredient) : ""}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<Button size="icon" variant="ghost" onClick={() => setDraft((current) => current.filter((i) => i.ingredientId !== item.ingredientId))}>
														<Trash2Icon className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										);
									})}
									{draft.length === 0 && (
										<TableRow>
											<TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
												Selecciona un producto y agrega ingredientes.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>

						<div className="flex flex-wrap justify-end gap-2">
							{selectedRecipe && (
								<Button variant="destructive" onClick={() => deleteRecipe.mutate({ recipeId: selectedRecipe.id })}>
									<Trash2Icon className="mr-2 h-4 w-4" />
									Eliminar
								</Button>
							)}
							<Button disabled={!productId || draft.length === 0 || saveRecipe.isPending} onClick={() => productId && saveRecipe.mutate({ productId, items: draft })}>
								<SaveIcon className="mr-2 h-4 w-4" />
								{selectedRecipe ? "Actualizar receta" : "Guardar receta"}
							</Button>
						</div>
					</div>

					<div className="space-y-4 rounded-xl border p-4">
						<div>
							<p className="font-semibold">Crear ingrediente</p>
							<p className="text-muted-foreground text-sm">
								Úsalo para alcohol por ml, insumos por gramos o piezas.
							</p>
						</div>
						<div className="space-y-2">
							<Label>Nombre</Label>
							<Input value={newIngredientName} onChange={(event) => setNewIngredientName(event.target.value)} placeholder="Ej. Vodka, limón, Red Bull" />
						</div>
						<div className="space-y-2">
							<Label>Unidad</Label>
							<Select value={newIngredientUnit} onValueChange={(value) => setNewIngredientUnit(value as "ml" | "g" | "unit")}>
								<SelectTrigger><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="ml">ml</SelectItem>
									<SelectItem value="g">g</SelectItem>
									<SelectItem value="unit">unidades</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Button
							className="w-full"
							disabled={!newIngredientName.trim() || createIngredient.isPending}
							onClick={() =>
								createIngredient.mutate({
									name: newIngredientName,
									unit: newIngredientUnit,
									stockQuantity: 0,
									packageSize: newIngredientUnit === "unit" ? 1 : newIngredientUnit === "ml" ? 750 : 1000,
									lowStockThreshold: newIngredientUnit === "unit" ? 10 : 750,
								})
							}
						>
							<PlusIcon className="mr-2 h-4 w-4" />
							Crear ingrediente
						</Button>

						<div className="border-t pt-4">
							<p className="font-semibold">Unidades</p>
							<p className="text-muted-foreground text-sm">
								Edita cómo se mide y se compra cada ingrediente.
							</p>
						</div>
						<div className="max-h-48 space-y-2 overflow-y-auto pr-1">
							{data?.ingredients.map((ingredient) => (
								<button
									key={ingredient.id}
									type="button"
									onClick={() => startEditingIngredient(ingredient)}
									className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:border-primary/50 ${
										ingredient.id === editingIngredientId ? "border-primary bg-primary/5" : ""
									}`}
								>
									<div className="flex items-center justify-between gap-3">
										<span className="font-medium">{ingredient.name}</span>
										<span className="text-muted-foreground">{unitLabel(ingredient)}</span>
									</div>
								</button>
							))}
						</div>
						{editingIngredientId && (
							<div className="space-y-3 rounded-lg border bg-muted/20 p-3">
								<div className="space-y-2">
									<Label>Nombre</Label>
									<Input value={ingredientForm.name} onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))} />
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>Unidad</Label>
										<Select value={ingredientForm.unit} onValueChange={(value) => setIngredientForm((current) => ({ ...current, unit: value as "ml" | "g" | "unit" }))}>
											<SelectTrigger><SelectValue /></SelectTrigger>
											<SelectContent>
												<SelectItem value="ml">ml</SelectItem>
												<SelectItem value="g">g</SelectItem>
												<SelectItem value="unit">unidades</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>Contenido por paquete</Label>
										<Input type="number" min="0.01" step="0.01" value={ingredientForm.packageSize} onChange={(event) => setIngredientForm((current) => ({ ...current, packageSize: Number(event.target.value) }))} />
									</div>
								</div>
								<div className="space-y-2">
									<Label>Mínimo de inventario</Label>
									<Input type="number" min="0" step="0.01" value={ingredientForm.lowStockThreshold} onChange={(event) => setIngredientForm((current) => ({ ...current, lowStockThreshold: Number(event.target.value) }))} />
								</div>
								<div className="flex justify-end gap-2">
									<Button variant="outline" onClick={() => setEditingIngredientId(null)}>Cancelar</Button>
									<Button
										disabled={
											!selectedIngredient ||
											!ingredientForm.name.trim() ||
											ingredientForm.packageSize <= 0 ||
											ingredientForm.lowStockThreshold < 0 ||
											updateIngredient.isPending
										}
										onClick={() =>
											selectedIngredient &&
											updateIngredient.mutate({
												id: selectedIngredient.id,
												name: ingredientForm.name,
												unit: ingredientForm.unit,
												packageSize: ingredientForm.packageSize,
												lowStockThreshold: ingredientForm.lowStockThreshold,
											})
										}
									>
										Guardar unidad
									</Button>
								</div>
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function AuditSection() {
	const trpc = useTRPC();
	const { data } = useQuery(trpc.recipes.auditSummary.queryOptions());
	const liveRows =
		data?.rows.map((row) => ({
			product: row.name,
			sold:
				row.expectedConsumed > 0
					? `${formatInventoryQty(row.expectedConsumed, row.unit, row.packageSize)} consumidos`
					: "Sin consumo registrado",
			expected: formatInventoryQty(row.expectedStock, row.unit, row.packageSize),
			counted: formatInventoryQty(row.realStock, row.unit, row.packageSize),
			quality: formatInventoryQty(row.qualityAdjustment, row.unit, row.packageSize),
			final: formatInventoryQty(row.finalDifference, row.unit, row.packageSize, true),
			range: `${row.differencePercent > 0 ? "+" : ""}${row.differencePercent.toFixed(1)}%`,
			tolerance: `${row.tolerancePercent}%`,
			status: row.status,
			severity:
				row.status === "Fuera de rango"
					? "critical"
					: row.status === "Conteo pendiente"
						? "warning"
						: "ok",
		})) ?? [];
	const rows = liveRows.length > 0 ? liveRows : auditRows;
	const outOfRange = rows.filter((row) => row.severity === "critical").length;
	const pending = rows.filter((row) => row.severity === "warning").length;
	const ok = rows.filter((row) => row.severity === "ok").length;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-4">
				<MetricCard icon={ShieldCheckIcon} label="Revisados" value={rows.length} detail="Ingredientes" accent="text-blue-600" />
				<MetricCard icon={CheckCircle2Icon} label="Dentro de rango" value={ok} detail="Sin pendiente" accent="text-emerald-600" />
				<MetricCard icon={AlertTriangleIcon} label="Fuera de rango" value={outOfRange} detail="Diferencia final" accent="text-red-600" />
				<MetricCard icon={ArchiveRestoreIcon} label="Conteo pendiente" value={pending} detail="Sin conteo físico" accent="text-amber-600" />
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<AuditSimpleTable title="Supuesto" description="Ventas y recetas." rows={rows} mode="expected" />
				<AuditSimpleTable title="Real" description="Conteo físico y Calidad." rows={rows} mode="real" />
			</div>

			{(data?.recipeMissing.length ?? 0) > 0 && (
				<Card className="border-amber-200 bg-amber-50/60">
					<CardHeader>
						<CardTitle>Productos sin receta</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
						{data?.recipeMissing.map((item) => (
							<div key={item.name} className="rounded-lg border bg-white px-3 py-2 text-sm">
								<p className="font-medium">{item.name}</p>
								<p className="text-muted-foreground">{item.quantity} vendidos</p>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Conciliación final</CardTitle>
					<CardDescription>
						La diferencia final se compara contra la tolerancia del producto para definir el estado de revisión.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Producto</TableHead>
									<TableHead>Esperado</TableHead>
									<TableHead>Conteo físico</TableHead>
									<TableHead>Ajustes Calidad</TableHead>
									<TableHead>Diferencia final</TableHead>
									<TableHead>Rango</TableHead>
									<TableHead>Tolerancia</TableHead>
									<TableHead>Estado</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.product}>
										<TableCell className="font-medium">{row.product}</TableCell>
										<TableCell>{row.expected}</TableCell>
										<TableCell>{row.counted}</TableCell>
										<TableCell>{row.quality}</TableCell>
										<TableCell className="font-medium">{row.final}</TableCell>
										<TableCell>{row.range}</TableCell>
										<TableCell>{row.tolerance}</TableCell>
										<TableCell><StatusBadge severity={row.severity} label={row.status} /></TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function QualitySection() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data } = useQuery(trpc.recipes.overview.queryOptions());
	const [editing, setEditing] = useState<Ingredient | null>(null);
	const [form, setForm] = useState({
		name: "",
		unit: "ml" as "ml" | "g" | "unit",
		packageSize: 750,
		lowStockThreshold: 750,
		shelfLifeDays: 7,
		openedDays: 0,
	});
	const updateIngredient = useMutation(
		trpc.recipes.updateIngredient.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.recipes.overview.queryOptions());
				setEditing(null);
				toast.success("Configuración guardada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const openConfig = (ingredient?: Ingredient) => {
		if (!ingredient) {
			toast.error("Este registro no tiene ingrediente editable.");
			return;
		}
		const profile = qualityProfileFor(ingredient);
		setEditing(ingredient);
		setForm({
			name: ingredient.name,
			unit: ingredient.unit as "ml" | "g" | "unit",
			packageSize: ingredient.package_size,
			lowStockThreshold: ingredient.low_stock_threshold,
			shelfLifeDays: ingredient.shelf_life_days ?? profile?.lifeDays ?? defaultLifeDays(ingredient),
			openedDays: ingredient.opened_days ?? profile?.daysOpen ?? 0,
		});
	};
	const rows =
		(data?.ingredients ?? []).map((ingredient, index) => {
			const profile = qualityProfileFor(ingredient);
			const lifeDays = ingredient.shelf_life_days ?? profile?.lifeDays ?? defaultLifeDays(ingredient);
			const daysOpen = ingredient.opened_days ?? profile?.daysOpen ?? index % 5;
			const daysLeft = Math.max(0, lifeDays - daysOpen);
			const severity =
				daysLeft <= 1 ? "critical" : daysLeft <= Math.ceil(lifeDays * 0.35) ? "warning" : "ok";
			return {
				ingredient,
				product: ingredient.name,
				group: unitLabel(ingredient),
				status:
					severity === "critical"
						? "Por vencer"
						: severity === "warning"
							? "Revisar"
							: "Correcto",
				opened: ingredient.unit === "unit" ? "No aplica" : `Hace ${daysOpen} días`,
				idealWindow: `${lifeDays} días`,
				expiration: `${daysLeft} días restantes`,
				severity,
			};
		}).sort((a, b) => {
			const priority = { critical: 0, warning: 1, ok: 2 };
			return priority[a.severity as keyof typeof priority] - priority[b.severity as keyof typeof priority] || a.product.localeCompare(b.product);
		});

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<MetricCard icon={PackageCheckIcon} label="Correctos" value={rows.filter((row) => row.severity === "ok").length} detail="Dentro de vida útil" accent="text-emerald-600" />
				<MetricCard icon={CalendarClockIcon} label="Revisar" value={rows.filter((row) => row.severity === "warning").length} detail="Cerca de vencer" accent="text-amber-600" />
				<MetricCard icon={ArchiveRestoreIcon} label="Configurados" value={rows.length} detail="Vida útil asignada" accent="text-blue-600" />
				<MetricCard icon={AlertTriangleIcon} label="Por vencer" value={rows.filter((row) => row.severity === "critical").length} detail="Atención requerida" accent="text-red-600" />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Calidad</CardTitle>
					<CardDescription>
						Vida útil por ingrediente.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Producto / ingrediente</TableHead>
									<TableHead>Estado</TableHead>
									<TableHead>Tiempo abierto</TableHead>
									<TableHead>Vida útil</TableHead>
									<TableHead>Expira en</TableHead>
									<TableHead className="text-right">Configuración</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.product}>
										<TableCell>
											<p className="font-medium">{row.product}</p>
											<p className="text-muted-foreground text-xs">{row.group}</p>
										</TableCell>
										<TableCell><StatusBadge severity={row.severity} label={row.status} /></TableCell>
										<TableCell>{row.opened}</TableCell>
										<TableCell>{row.idealWindow}</TableCell>
										<TableCell>{row.expiration}</TableCell>
										<TableCell className="text-right">
											<Button type="button" variant="outline" size="sm" disabled={!row.ingredient} onClick={() => openConfig(row.ingredient)}>
												Configurar
											</Button>
										</TableCell>
									</TableRow>
								))}
								{rows.length === 0 && (
									<TableRow>
										<TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
											No hay ingredientes configurados.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Vida útil del ingrediente</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<div className="space-y-2">
							<Label>Ingrediente</Label>
							<Input value={form.name} readOnly />
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>Vida útil en días</Label>
								<Input type="number" min="1" step="1" value={form.shelfLifeDays} onChange={(event) => setForm((current) => ({ ...current, shelfLifeDays: Number(event.target.value) }))} />
							</div>
							<div className="space-y-2">
								<Label>Días abierto</Label>
								<Input type="number" min="0" step="1" value={form.openedDays} onChange={(event) => setForm((current) => ({ ...current, openedDays: Number(event.target.value) }))} />
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
						<Button
							disabled={
								!editing ||
								!form.name.trim() ||
								form.packageSize <= 0 ||
								form.lowStockThreshold < 0 ||
								form.shelfLifeDays <= 0 ||
								form.openedDays < 0 ||
								updateIngredient.isPending
							}
							onClick={() =>
								editing &&
								updateIngredient.mutate({
									id: editing.id,
									name: form.name,
									unit: form.unit,
									packageSize: form.packageSize,
									lowStockThreshold: form.lowStockThreshold,
									shelfLifeDays: form.shelfLifeDays,
									openedDays: form.openedDays,
								})
							}
						>
							Guardar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function AlertsSection({ onSelectTab }: { onSelectTab: (tab: TabId) => void }) {
	const critical = alertRows.filter((row) => row.level === "Crítica");
	const others = alertRows.filter((row) => row.level !== "Crítica");
	return (
		<div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
			<Card className="border-red-200 bg-red-50/50">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangleIcon className="h-5 w-5 text-red-600" />
						Prioridad alta
					</CardTitle>
					<CardDescription>Elementos que requieren revisión antes de cerrar turno.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{critical.map((alert) => <AlertItem key={alert.title} alert={alert} onSelectTab={onSelectTab} featured />)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Centro de alertas</CardTitle>
					<CardDescription>Separado por Inventario, Calidad, Auditoría, Reabastecimiento y Recetas.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{others.map((alert) => <AlertItem key={alert.title} alert={alert} onSelectTab={onSelectTab} />)}
				</CardContent>
			</Card>
		</div>
	);
}

function RestockingTable({ rows }: { rows: typeof restockingDemoRows }) {
	return (
		<div className="overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Producto</TableHead>
						<TableHead>Estado</TableHead>
						<TableHead>Stock actual</TableHead>
						<TableHead>Demanda</TableHead>
						<TableHead>Proveedor</TableHead>
						<TableHead>Cobertura</TableHead>
						<TableHead>Nivel ideal</TableHead>
						<TableHead>Comprar</TableHead>
						<TableHead>Base del cálculo</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.product}>
							<TableCell>
								<p className="font-medium">{row.product}</p>
								<p className="text-muted-foreground text-xs">{row.category}</p>
							</TableCell>
							<TableCell><StatusBadge severity={row.severity} label={row.status} /></TableCell>
							<TableCell>{row.stock}</TableCell>
							<TableCell>{row.demand}</TableCell>
							<TableCell>{row.leadTime}</TableCell>
							<TableCell>{row.coverage}</TableCell>
							<TableCell>{row.target}</TableCell>
							<TableCell className="font-bold">{row.order}</TableCell>
							<TableCell className="text-muted-foreground text-sm">{row.reason}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AuditSimpleTable({
	title,
	description,
	rows,
	mode,
}: {
	title: string;
	description: string;
	rows: typeof auditRows;
	mode: "expected" | "real";
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Producto</TableHead>
								{mode === "expected" ? (
									<>
										<TableHead>Base</TableHead>
										<TableHead>Consumo esperado</TableHead>
										<TableHead>Tolerancia</TableHead>
									</>
								) : (
									<>
										<TableHead>Conteo físico</TableHead>
										<TableHead>Ajustes Calidad</TableHead>
										<TableHead>Diferencia final</TableHead>
									</>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={`${mode}-${row.product}`}>
									<TableCell className="font-medium">{row.product}</TableCell>
									{mode === "expected" ? (
										<>
											<TableCell>{row.sold}</TableCell>
											<TableCell>{row.expected}</TableCell>
											<TableCell>{row.tolerance}</TableCell>
										</>
									) : (
										<>
											<TableCell>{row.counted}</TableCell>
											<TableCell>{row.quality}</TableCell>
											<TableCell className="font-medium">{row.final}</TableCell>
										</>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}

function AlertItem({
	alert,
	onSelectTab,
	featured,
}: {
	alert: (typeof alertRows)[number];
	onSelectTab: (tab: TabId) => void;
	featured?: boolean;
}) {
	return (
		<div className={`rounded-xl border p-4 ${featured ? "bg-white" : "bg-card"}`}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">{alert.type}</Badge>
						<StatusBadge severity={alert.level === "Crítica" ? "critical" : alert.level === "Alta" ? "warning" : "ok"} label={alert.level} />
					</div>
					<p className="mt-2 font-semibold">{alert.title}</p>
					<p className="text-muted-foreground text-sm">{alert.detail}</p>
					<p className="mt-1 text-xs text-muted-foreground">Impacto: {alert.impact}</p>
				</div>
				<Button type="button" size="sm" variant={featured ? "default" : "outline"} onClick={() => onSelectTab(alert.tab)}>
					Abrir
				</Button>
			</div>
		</div>
	);
}

function MetricCard({
	icon: Icon,
	label,
	value,
	detail,
	accent = "text-primary",
}: {
	icon: LucideIcon;
	label: string;
	value: string | number;
	detail: string;
	accent?: string;
}) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-3xl">{value}</p>
					<p className="text-muted-foreground text-xs">{detail}</p>
				</div>
				<Icon className={`h-8 w-8 ${accent}`} />
			</CardContent>
		</Card>
	);
}

function StatusBadge({ severity, label }: { severity: string; label: string }) {
	if (severity === "critical") return <Badge variant="destructive">{label}</Badge>;
	if (severity === "warning") return <Badge className="border-amber-200 bg-amber-100 text-amber-800">{label}</Badge>;
	return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">{label}</Badge>;
}

function RuleCard({ title, lines }: { title: string; lines: string[] }) {
	return (
		<div className="rounded-xl border p-4">
			<p className="font-semibold">{title}</p>
			<ul className="mt-2 space-y-1 text-muted-foreground text-sm">
				{lines.map((line) => <li key={line}>• {line}</li>)}
			</ul>
		</div>
	);
}

function unitLabel(ingredient: Ingredient) {
	return ingredient.unit === "unit" ? "u." : ingredient.unit;
}

function unitText(unit: string) {
	return unit === "unit" ? "u." : unit;
}

function formatQty(value: number) {
	return Number(value.toFixed(2)).toLocaleString("es-MX");
}

function formatSigned(value: number) {
	const formatted = formatQty(value);
	return value > 0 ? `+${formatted}` : formatted;
}

function formatInventoryQty(
	value: number,
	unit: string,
	packageSize: number,
	signed = false,
) {
	const prefix = signed && value > 0 ? "+" : "";
	const absolute = Math.abs(value);
	if (unit === "ml" && packageSize >= 500) {
		const bottles = absolute / packageSize;
		const label = bottles === 1 ? "botella" : "botellas";
		return `${value < 0 ? "-" : prefix}${formatQty(bottles)} ${label}`;
	}
	if (unit === "unit") {
		return `${value < 0 ? "-" : prefix}${formatQty(absolute)} u.`;
	}
	return `${value < 0 ? "-" : prefix}${formatQty(absolute)} ${unitText(unit)}`;
}

function defaultLifeDays(ingredient: Ingredient) {
	const name = ingredient.name.toLowerCase();
	if (ingredient.unit === "unit") return 365;
	if (name.includes("limón") || name.includes("limÃ³n") || name.includes("jugo")) return 7;
	if (name.includes("alita") || name.includes("pollo") || name.includes("carne")) return 4;
	if (ingredient.unit === "ml") return 60;
	return 10;
}

function qualityProfileFor(ingredient?: Ingredient) {
	if (!ingredient) return null;
	const name = ingredient.name.toLowerCase();
	if (name.includes("jugo de limón") || name.includes("jugo de limÃ³n")) {
		return { daysOpen: 7, lifeDays: 7, authorized: "250 ml", covered: "250 ml" };
	}
	if (name.includes("alitas") || name.includes("pollo")) {
		return { daysOpen: 4, lifeDays: 4, authorized: "600 g", covered: "600 g" };
	}
	if (name.includes("pico de gallo")) {
		return { daysOpen: 3, lifeDays: 4, authorized: "350 g", covered: "350 g" };
	}
	if (name.includes("limón") || name.includes("limÃ³n")) {
		return { daysOpen: 6, lifeDays: 7, authorized: "400 g", covered: "400 g" };
	}
	if (name.includes("queso") || name.includes("carnes frías") || name.includes("carnes frÃ­as")) {
		return { daysOpen: 8, lifeDays: 10, authorized: "0", covered: "0" };
	}
	if (name.includes("papa")) {
		return { daysOpen: 7, lifeDays: 10, authorized: "0", covered: "0" };
	}
	if (name.includes("vodka") || name.includes("tequila") || name.includes("whisky") || name.includes("ron")) {
		return { daysOpen: 18, lifeDays: 60, authorized: "0", covered: "0" };
	}
	return null;
}
