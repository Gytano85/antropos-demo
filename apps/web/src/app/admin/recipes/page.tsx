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
	DialogDescription,
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
import { Skeleton } from "@finopenpos/ui/components/skeleton";
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
	BeakerIcon,
	ClipboardCheckIcon,
	PackagePlusIcon,
	PlusIcon,
	SaveIcon,
	Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";

type Overview = RouterOutputs["recipes"]["overview"];
type Ingredient = Overview["ingredients"][number];

interface RecipeDraftItem {
	ingredientId: number;
	quantity: number;
}

export default function RecipesPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const t = useTranslations("recipes");
	const tc = useTranslations("common");
	const { data, isLoading } = useQuery(trpc.recipes.overview.queryOptions());
	const { data: warnings } = useQuery(trpc.recipes.warnings.queryOptions());

	const [ingredientName, setIngredientName] = useState("");
	const [ingredientUnit, setIngredientUnit] = useState<"ml" | "g" | "unit">(
		"ml",
	);
	const [initialStock, setInitialStock] = useState(0);
	const [packageSize, setPackageSize] = useState(750);
	const [lowStockThreshold, setLowStockThreshold] = useState(750);

	const [productId, setProductId] = useState<number | null>(null);
	const [draftItems, setDraftItems] = useState<RecipeDraftItem[]>([]);
	const [selectedIngredientId, setSelectedIngredientId] = useState<
		number | null
	>(null);
	const [componentQuantity, setComponentQuantity] = useState(0);

	const [stockDialog, setStockDialog] = useState<{
		mode: "restock" | "count";
		ingredient: Ingredient;
	} | null>(null);
	const [stockQuantity, setStockQuantity] = useState(0);
	const [stockNotes, setStockNotes] = useState("");

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries(trpc.recipes.overview.queryOptions()),
			queryClient.invalidateQueries(trpc.recipes.warnings.queryOptions()),
		]);
	};

	const createIngredient = useMutation(
		trpc.recipes.createIngredient.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setIngredientName("");
				setInitialStock(0);
				toast.success(t("ingredientCreated"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveRecipe = useMutation(
		trpc.recipes.saveRecipe.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success(t("recipeSaved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const deleteRecipe = useMutation(
		trpc.recipes.deleteRecipe.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setProductId(null);
				setDraftItems([]);
				toast.success(t("recipeDeleted"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const restock = useMutation(
		trpc.recipes.restockIngredient.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setStockDialog(null);
				toast.success(t("stockUpdated"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const count = useMutation(
		trpc.recipes.countIngredient.mutationOptions({
			onSuccess: async (result) => {
				await invalidate();
				setStockDialog(null);
				if (result.exceeds_tolerance) {
					toast.warning(t("countWarning"));
				} else {
					toast.success(t("countSaved"));
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const selectedRecipe = useMemo(
		() => data?.recipes.find((recipe) => recipe.product_id === productId),
		[data, productId],
	);

	const selectProduct = (value: string) => {
		const selectedId = Number(value);
		setProductId(selectedId);
		const recipe = data?.recipes.find(
			(candidate) => candidate.product_id === selectedId,
		);
		setDraftItems(
			recipe?.items.map((item) => ({
				ingredientId: item.ingredient_id,
				quantity: item.quantity,
			})) ?? [],
		);
	};

	const addComponent = () => {
		if (!selectedIngredientId || componentQuantity <= 0) return;
		setDraftItems((current) => {
			const existing = current.find(
				(item) => item.ingredientId === selectedIngredientId,
			);
			if (existing) {
				return current.map((item) =>
					item.ingredientId === selectedIngredientId
						? { ...item, quantity: componentQuantity }
						: item,
				);
			}
			return [
				...current,
				{
					ingredientId: selectedIngredientId,
					quantity: componentQuantity,
				},
			];
		});
		setSelectedIngredientId(null);
		setComponentQuantity(0);
	};

	const unitLabel = (unit: string) => (unit === "unit" ? t("units") : unit);

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card className="border-blue-200 bg-blue-50/50">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BeakerIcon className="h-5 w-5 text-blue-600" />
						{t("title")}
					</CardTitle>
					<CardDescription>{t("subtitle")}</CardDescription>
				</CardHeader>
				<CardContent className="text-sm">
					{t("toleranceExplanation", {
						percent: data.tolerancePercent,
					})}
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
				<Card>
					<CardHeader>
						<CardTitle>{t("newIngredient")}</CardTitle>
						<CardDescription>{t("ingredientHint")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="ingredient-name">{tc("name")}</Label>
							<Input
								id="ingredient-name"
								value={ingredientName}
								onChange={(event) => setIngredientName(event.target.value)}
								placeholder={t("ingredientPlaceholder")}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("measurementUnit")}</Label>
							<Select
								value={ingredientUnit}
								onValueChange={(value) => {
									const unit = value as "ml" | "g" | "unit";
									setIngredientUnit(unit);
									if (unit === "unit") {
										setPackageSize(1);
										setLowStockThreshold(10);
									}
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ml">{t("milliliters")}</SelectItem>
									<SelectItem value="g">{t("grams")}</SelectItem>
									<SelectItem value="unit">{t("units")}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<NumberField
							label={t("initialStock")}
							value={initialStock}
							onChange={setInitialStock}
						/>
						<NumberField
							label={t("packageSize")}
							value={packageSize}
							onChange={setPackageSize}
							min={0.01}
						/>
						<NumberField
							label={t("lowStock")}
							value={lowStockThreshold}
							onChange={setLowStockThreshold}
						/>
						<Button
							className="sm:col-span-2"
							disabled={!ingredientName.trim() || createIngredient.isPending}
							onClick={() =>
								createIngredient.mutate({
									name: ingredientName,
									unit: ingredientUnit,
									stockQuantity: initialStock,
									packageSize,
									lowStockThreshold,
								})
							}
						>
							<PlusIcon className="mr-2 h-4 w-4" />
							{t("addIngredient")}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("recipeEditor")}</CardTitle>
						<CardDescription>{t("recipeHint")}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>{t("menuProduct")}</Label>
							<Select
								value={productId ? String(productId) : undefined}
								onValueChange={selectProduct}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("selectProduct")} />
								</SelectTrigger>
								<SelectContent>
									{data.products.map((product) => (
										<SelectItem key={product.id} value={String(product.id)}>
											{product.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
							<Select
								value={
									selectedIngredientId
										? String(selectedIngredientId)
										: undefined
								}
								onValueChange={(value) =>
									setSelectedIngredientId(Number(value))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("selectIngredient")} />
								</SelectTrigger>
								<SelectContent>
									{data.ingredients.map((ingredient) => (
										<SelectItem
											key={ingredient.id}
											value={String(ingredient.id)}
										>
											{ingredient.name} ({unitLabel(ingredient.unit)})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								type="number"
								min="0.01"
								step="0.01"
								value={componentQuantity}
								onChange={(event) =>
									setComponentQuantity(Number(event.target.value))
								}
								placeholder={t("quantity")}
							/>
							<Button
								type="button"
								variant="outline"
								onClick={addComponent}
								disabled={!productId || !selectedIngredientId}
							>
								{tc("add")}
							</Button>
						</div>

						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t("ingredient")}</TableHead>
										<TableHead className="text-right">
											{t("perServing")}
										</TableHead>
										<TableHead className="w-12" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{draftItems.map((item) => {
										const ingredient = data.ingredients.find(
											(candidate) => candidate.id === item.ingredientId,
										);
										return (
											<TableRow key={item.ingredientId}>
												<TableCell>{ingredient?.name}</TableCell>
												<TableCell className="text-right">
													{item.quantity}{" "}
													{ingredient ? unitLabel(ingredient.unit) : ""}
												</TableCell>
												<TableCell>
													<Button
														size="icon"
														variant="ghost"
														onClick={() =>
															setDraftItems((current) =>
																current.filter(
																	(component) =>
																		component.ingredientId !==
																		item.ingredientId,
																),
															)
														}
													>
														<Trash2Icon className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										);
									})}
									{draftItems.length === 0 && (
										<TableRow>
											<TableCell
												colSpan={3}
												className="h-20 text-center text-muted-foreground"
											>
												{t("emptyRecipe")}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>

						<div className="flex flex-wrap justify-end gap-2">
							{selectedRecipe && (
								<Button
									variant="destructive"
									onClick={() =>
										deleteRecipe.mutate({ recipeId: selectedRecipe.id })
									}
								>
									<Trash2Icon className="mr-2 h-4 w-4" />
									{t("deleteRecipe")}
								</Button>
							)}
							<Button
								disabled={
									!productId || draftItems.length === 0 || saveRecipe.isPending
								}
								onClick={() =>
									productId &&
									saveRecipe.mutate({ productId, items: draftItems })
								}
							>
								<SaveIcon className="mr-2 h-4 w-4" />
								{t("saveRecipe")}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("ingredientInventory")}</CardTitle>
					<CardDescription>{t("inventoryHint")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("ingredient")}</TableHead>
									<TableHead>{t("unit")}</TableHead>
									<TableHead className="text-right">{t("stock")}</TableHead>
									<TableHead className="text-right">
										{t("packagesEquivalent")}
									</TableHead>
									<TableHead>{tc("status")}</TableHead>
									<TableHead className="text-right">{tc("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.ingredients.map((ingredient) => {
									const low =
										ingredient.stock_quantity <= ingredient.low_stock_threshold;
									return (
										<TableRow key={ingredient.id}>
											<TableCell className="font-medium">
												{ingredient.name}
											</TableCell>
											<TableCell>{unitLabel(ingredient.unit)}</TableCell>
											<TableCell className="text-right">
												{ingredient.stock_quantity.toFixed(2)}
											</TableCell>
											<TableCell className="text-right">
												{(
													ingredient.stock_quantity / ingredient.package_size
												).toFixed(2)}
											</TableCell>
											<TableCell>
												<Badge variant={low ? "destructive" : "outline"}>
													{low ? t("low") : t("available")}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex justify-end gap-2">
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															setStockDialog({
																mode: "restock",
																ingredient,
															});
															setStockQuantity(ingredient.package_size);
															setStockNotes("");
														}}
													>
														<PackagePlusIcon className="mr-2 h-4 w-4" />
														{t("receive")}
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															setStockDialog({ mode: "count", ingredient });
															setStockQuantity(ingredient.stock_quantity);
															setStockNotes("");
														}}
													>
														<ClipboardCheckIcon className="mr-2 h-4 w-4" />
														{t("physicalCount")}
													</Button>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangleIcon className="h-5 w-5 text-amber-600" />
						{t("warnings")}
					</CardTitle>
					<CardDescription>
						{t("warningHint", {
							percent: warnings?.tolerancePercent ?? data.tolerancePercent,
						})}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{(warnings?.countWarnings.length ?? 0) === 0 &&
					(warnings?.orderWarnings.length ?? 0) === 0 ? (
						<p className="text-muted-foreground text-sm">{t("noWarnings")}</p>
					) : (
						<>
							{warnings?.countWarnings.map((warning) => (
								<div
									key={`count-${warning.id}`}
									className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm"
								>
									<p className="font-semibold text-red-800">
										{t("physicalMismatch", {
											ingredient: warning.ingredient.name,
										})}
									</p>
									<p>
										{t("mismatchDetail", {
											expected: warning.expected_quantity.toFixed(2),
											counted: warning.counted_quantity.toFixed(2),
											unit: unitLabel(warning.ingredient.unit),
											percent: warning.variance_percent.toFixed(1),
										})}
									</p>
								</div>
							))}
							{warnings?.orderWarnings.map((warning, index) => (
								<div
									key={`order-${warning.orderId}-${warning.ingredientName}-${index}`}
									className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
								>
									<p className="font-semibold text-amber-900">
										{t("orderMismatch", {
											order: warning.tableName ?? `#${warning.orderId}`,
											product: warning.productName,
										})}
									</p>
									<p>
										{t("orderMismatchDetail", {
											ingredient: warning.ingredientName,
											expected: warning.expectedQuantity.toFixed(2),
											recorded: warning.recordedQuantity.toFixed(2),
											unit: unitLabel(warning.unit),
											percent: warning.variancePercent.toFixed(1),
										})}
									</p>
								</div>
							))}
						</>
					)}
				</CardContent>
			</Card>

			<Dialog
				open={stockDialog !== null}
				onOpenChange={(open) => !open && setStockDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{stockDialog?.mode === "restock"
								? t("receiveIngredient")
								: t("countIngredient")}
						</DialogTitle>
						<DialogDescription>
							{stockDialog?.ingredient.name}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label>
								{stockDialog?.mode === "restock"
									? t("quantityReceived")
									: t("countedQuantity")}
							</Label>
							<Input
								type="number"
								min="0"
								step="0.01"
								value={stockQuantity}
								onChange={(event) =>
									setStockQuantity(Number(event.target.value))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("notes")}</Label>
							<Input
								value={stockNotes}
								onChange={(event) => setStockNotes(event.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							disabled={!stockDialog || stockQuantity < 0}
							onClick={() => {
								if (!stockDialog) return;
								if (stockDialog.mode === "restock") {
									restock.mutate({
										ingredientId: stockDialog.ingredient.id,
										quantity: stockQuantity,
										notes: stockNotes || undefined,
									});
								} else {
									count.mutate({
										ingredientId: stockDialog.ingredient.id,
										countedQuantity: stockQuantity,
										notes: stockNotes || undefined,
									});
								}
							}}
						>
							{tc("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function NumberField({
	label,
	value,
	onChange,
	min = 0,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input
				type="number"
				min={min}
				step="0.01"
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		</div>
	);
}
