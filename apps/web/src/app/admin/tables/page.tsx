"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import {
	Card,
	CardContent,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Clock3Icon,
	DoorOpenIcon,
	Loader2Icon,
	MinusIcon,
	PlusIcon,
	ReceiptIcon,
	SearchIcon,
	Trash2Icon,
	UsersIcon,
	UtensilsIcon,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ProductImage } from "@/components/product-image";
import { useTRPC } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/utils";

export default function TablesPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const locale = useLocale();

	const { data: openTables = [], isLoading } = useQuery(
		trpc.tables.listOpen.queryOptions(),
	);
	const { data: products = [] } = useQuery(trpc.products.list.queryOptions());
	const { data: paymentMethods = [] } = useQuery(
		trpc.paymentMethods.list.queryOptions(),
	);

	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [newTableName, setNewTableName] = useState("");
	const [newPartySize, setNewPartySize] = useState(1);
	const [openDialog, setOpenDialog] = useState(false);
	const [closeDialog, setCloseDialog] = useState(false);
	const [paymentMethodId, setPaymentMethodId] = useState("");
	const [partySizeDraft, setPartySizeDraft] = useState<number | null>(null);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("all");

	const selectedTable =
		openTables.find((table) => table.id === selectedId) ??
		openTables[0] ??
		null;

	const categories = useMemo(() => {
		const values = new Set(
			products.map((product) => product.category).filter(Boolean),
		);
		return ["all", ...Array.from(values)] as string[];
	}, [products]);

	const filteredProducts = useMemo(() => {
		const term = search.trim().toLowerCase();
		return products
			.filter((product) => product.in_stock > 0)
			.filter((product) => category === "all" || product.category === category)
			.filter(
				(product) =>
					!term ||
					product.name.toLowerCase().includes(term) ||
					(product.category ?? "").toLowerCase().includes(term),
			);
	}, [category, products, search]);

	const totals = useMemo(() => {
		const items = selectedTable?.orderItems ?? [];
		return {
			items: items.reduce((total, item) => total + item.quantity, 0),
			lines: items.length,
			total: selectedTable?.total_amount ?? 0,
		};
	}, [selectedTable]);

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries(trpc.tables.listOpen.queryOptions()),
			queryClient.invalidateQueries(trpc.orders.list.queryOptions()),
			queryClient.invalidateQueries(trpc.products.list.queryOptions()),
			queryClient.invalidateQueries(trpc.dashboard.stats.queryOptions()),
		]);
	};

	const openMutation = useMutation(
		trpc.tables.open.mutationOptions({
			onSuccess: async (table) => {
				setOpenDialog(false);
				setNewTableName("");
				setNewPartySize(1);
				setSelectedId(table.id);
				await refresh();
				toast.success("Mesa abierta");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const setPartySizeMutation = useMutation(
		trpc.tables.setPartySize.mutationOptions({
			onSuccess: async () => {
				setPartySizeDraft(null);
				await refresh();
				toast.success("Personas actualizadas");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const addMutation = useMutation(
		trpc.tables.addItem.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Producto agregado");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const decrementMutation = useMutation(
		trpc.tables.decrementItem.mutationOptions({
			onSuccess: async () => {
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const removeMutation = useMutation(
		trpc.tables.removeItem.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Producto retirado");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const closeMutation = useMutation(
		trpc.tables.close.mutationOptions({
			onSuccess: async () => {
				setCloseDialog(false);
				setPaymentMethodId("");
				setSelectedId(null);
				await refresh();
				toast.success("Mesa cerrada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const addProduct = (productId: number, quantity = 1) => {
		if (!selectedTable) {
			toast.error("Selecciona o abre una mesa.");
			return;
		}
		addMutation.mutate({
			orderId: selectedTable.id,
			productId,
			quantity,
		});
	};

	if (isLoading) {
		return (
			<div className="flex min-h-64 items-center justify-center">
				<Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-semibold text-2xl">Comandas</h1>
					<p className="text-muted-foreground text-sm">
						Mesas abiertas, consumo activo y cierre de cuenta.
					</p>
				</div>
				<Button onClick={() => setOpenDialog(true)}>
					<PlusIcon className="mr-2 h-4 w-4" />
					Abrir mesa
				</Button>
			</div>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Mesas</CardTitle>
				</CardHeader>
				<CardContent>
					{openTables.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center text-muted-foreground">
							<DoorOpenIcon className="h-10 w-10" />
							<p>No hay mesas abiertas.</p>
							<Button variant="outline" onClick={() => setOpenDialog(true)}>
								Abrir primera mesa
							</Button>
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
							{openTables.map((table) => {
								const active = selectedTable?.id === table.id;
								const itemCount = table.orderItems.reduce(
									(total, item) => total + item.quantity,
									0,
								);
								return (
									<button
										key={table.id}
										type="button"
										onClick={() => {
											setSelectedId(table.id);
											setPartySizeDraft(null);
										}}
										className={`rounded-xl border p-4 text-left shadow-sm transition ${
											active
												? "border-primary bg-primary/5 ring-1 ring-primary"
												: "bg-card hover:border-primary/50 hover:shadow-md"
										}`}
									>
										<div className="flex items-start justify-between gap-2">
											<div>
												<p className="font-semibold text-lg">
													{table.table_name ?? "Mesa"}
												</p>
												<p className="text-muted-foreground text-xs">
													Comanda #{table.id}
												</p>
											</div>
											<Badge variant={itemCount > 0 ? "default" : "outline"}>
												{itemCount > 0 ? "Ocupada" : "Nueva"}
											</Badge>
										</div>
										<div className="mt-4 flex items-center justify-between text-sm">
											<span className="flex items-center gap-1 text-muted-foreground">
												<Clock3Icon className="h-3.5 w-3.5" />
												{table.created_at
													? new Date(table.created_at).toLocaleTimeString(locale, {
															hour: "2-digit",
															minute: "2-digit",
														})
													: "--:--"}
											</span>
											<span>{itemCount} prod.</span>
										</div>
										<p className="mt-3 font-bold text-xl">
											{formatCurrency(table.total_amount, locale)}
										</p>
									</button>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{selectedTable ? (
				<div className="grid gap-5 xl:grid-cols-[1fr_420px]">
					<Card>
						<CardHeader className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<CardTitle className="flex items-center gap-2">
										<UtensilsIcon className="h-5 w-5" />
										Agregar a {selectedTable.table_name}
									</CardTitle>
									<p className="mt-1 text-muted-foreground text-sm">
										Busca productos o usa las categorías.
									</p>
								</div>
								<div className="flex items-center gap-2 rounded-lg border px-3 py-2">
									<UsersIcon className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm">Personas</span>
									<Input
										type="number"
										min={1}
										max={999}
										className="h-8 w-20"
										value={partySizeDraft ?? selectedTable.party_size}
										onChange={(event) =>
											setPartySizeDraft(Math.max(1, Number(event.target.value)))
										}
									/>
									{partySizeDraft !== null &&
										partySizeDraft !== selectedTable.party_size && (
											<Button
												size="sm"
												disabled={setPartySizeMutation.isPending}
												onClick={() =>
													setPartySizeMutation.mutate({
														orderId: selectedTable.id,
														partySize: partySizeDraft,
													})
												}
											>
												Guardar
											</Button>
										)}
								</div>
							</div>

							<div className="flex flex-col gap-3 lg:flex-row">
								<div className="relative flex-1">
									<SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										value={search}
										onChange={(event) => setSearch(event.target.value)}
										placeholder="Buscar bebida, botella, alimento..."
										className="pl-9"
									/>
								</div>
								<div className="flex gap-2 overflow-x-auto pb-1">
									{categories.map((item) => (
										<Button
											key={item}
											type="button"
											variant={category === item ? "default" : "outline"}
											size="sm"
											onClick={() => setCategory(item)}
											className="whitespace-nowrap capitalize"
										>
											{item === "all" ? "Todo" : item.replace("_", " ")}
										</Button>
									))}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
								{filteredProducts.map((product) => (
									<button
										key={product.id}
										type="button"
										disabled={addMutation.isPending}
										onClick={() => addProduct(product.id)}
										className="overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md disabled:cursor-wait disabled:opacity-70"
									>
										<ProductImage
											src={product.image_url}
											category={product.category}
											alt={product.name}
											className="h-28 w-full rounded-none"
										/>
										<div className="space-y-2 p-3">
											<div className="flex items-start justify-between gap-2">
												<p className="line-clamp-2 font-semibold">{product.name}</p>
												<p className="font-semibold text-primary">
													{formatCurrency(product.price, locale)}
												</p>
											</div>
											<div className="flex items-center justify-between text-muted-foreground text-xs">
												<span className="capitalize">
													{product.category?.replace("_", " ") ?? "producto"}
												</span>
												<span>{product.in_stock} disp.</span>
											</div>
										</div>
									</button>
								))}
								{filteredProducts.length === 0 && (
									<div className="col-span-full rounded-xl border border-dashed py-12 text-center text-muted-foreground">
										No hay productos para esta búsqueda.
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					<Card className="xl:sticky xl:top-4 xl:self-start">
						<CardHeader className="border-b">
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardTitle className="flex items-center gap-2">
										<ReceiptIcon className="h-5 w-5" />
										{selectedTable.table_name}
									</CardTitle>
									<p className="mt-1 text-muted-foreground text-sm">
										{totals.lines} líneas · {totals.items} productos
									</p>
								</div>
								<Badge>Abierta</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4 pt-4">
							<div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
								{selectedTable.orderItems.length === 0 ? (
									<div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
										<p>Comanda vacía.</p>
										<p className="text-xs">Toca un producto para agregarlo.</p>
									</div>
								) : (
									selectedTable.orderItems.map((item) => (
										<div key={item.id} className="rounded-xl border p-3">
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="font-semibold">
														{item.product?.name ?? "Producto eliminado"}
													</p>
													<p className="text-muted-foreground text-xs capitalize">
														{item.product?.category?.replace("_", " ") ?? "sin categoría"}
													</p>
												</div>
												<p className="font-semibold">
													{formatCurrency(item.price * item.quantity, locale)}
												</p>
											</div>
											<div className="mt-3 flex items-center justify-between gap-3">
												<div className="flex items-center rounded-lg border">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														disabled={decrementMutation.isPending}
														onClick={() =>
															decrementMutation.mutate({
																orderId: selectedTable.id,
																itemId: item.id,
															})
														}
													>
														<MinusIcon className="h-4 w-4" />
													</Button>
													<span className="w-10 text-center font-semibold">
														{item.quantity}
													</span>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														disabled={addMutation.isPending || !item.product_id}
														onClick={() =>
															item.product_id && addProduct(item.product_id)
														}
													>
														<PlusIcon className="h-4 w-4" />
													</Button>
												</div>
												<div className="flex items-center gap-2">
													<span className="text-muted-foreground text-sm">
														{formatCurrency(item.price, locale)} c/u
													</span>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														disabled={removeMutation.isPending}
														onClick={() =>
															removeMutation.mutate({
																orderId: selectedTable.id,
																itemId: item.id,
															})
														}
													>
														<Trash2Icon className="h-4 w-4" />
													</Button>
												</div>
											</div>
										</div>
									))
								)}
							</div>

							<div className="space-y-2 border-t pt-4">
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Subtotal</span>
									<span>{formatCurrency(totals.total, locale)}</span>
								</div>
								<div className="flex items-center justify-between text-lg">
									<span className="font-semibold">Total</span>
									<span className="font-bold text-2xl">
										{formatCurrency(totals.total, locale)}
									</span>
								</div>
								<Button
									className="w-full"
									size="lg"
									disabled={selectedTable.orderItems.length === 0}
									onClick={() => setCloseDialog(true)}
								>
									<ReceiptIcon className="mr-2 h-4 w-4" />
									Cobrar y cerrar
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			) : (
				<Card>
					<CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
						<UtensilsIcon className="h-12 w-12" />
						<p>Abre una mesa para iniciar una comanda.</p>
						<Button onClick={() => setOpenDialog(true)}>Abrir mesa</Button>
					</CardContent>
				</Card>
			)}

			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Abrir mesa</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-3">
						<div className="space-y-2">
							<Label htmlFor="tableName">Nombre de mesa</Label>
							<Input
								id="tableName"
								autoFocus
								placeholder="Ej. Mesa 4, VIP 2, Barra 1"
								value={newTableName}
								onChange={(event) => setNewTableName(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="partySize">Personas</Label>
							<Input
								id="partySize"
								type="number"
								min={1}
								max={999}
								value={newPartySize}
								onChange={(event) =>
									setNewPartySize(Math.max(1, Number(event.target.value)))
								}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpenDialog(false)}>
							Cancelar
						</Button>
						<Button
							disabled={!newTableName.trim() || openMutation.isPending}
							onClick={() =>
								openMutation.mutate({
									tableName: newTableName.trim(),
									partySize: newPartySize,
								})
							}
						>
							{openMutation.isPending && (
								<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
							)}
							Iniciar comanda
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={closeDialog} onOpenChange={setCloseDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cobrar mesa</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-3">
						<div className="rounded-xl bg-muted p-4 text-center">
							<p className="text-muted-foreground text-sm">Total a pagar</p>
							<p className="font-bold text-3xl">
								{formatCurrency(selectedTable?.total_amount ?? 0, locale)}
							</p>
						</div>
						<div className="space-y-2">
							<Label>Método de pago</Label>
							<Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
								<SelectTrigger>
									<SelectValue placeholder="Seleccionar método" />
								</SelectTrigger>
								<SelectContent>
									{paymentMethods.map((method) => (
										<SelectItem key={method.id} value={String(method.id)}>
											{method.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCloseDialog(false)}>
							Cancelar
						</Button>
						<Button
							disabled={!paymentMethodId || closeMutation.isPending}
							onClick={() =>
								selectedTable &&
								closeMutation.mutate({
									orderId: selectedTable.id,
									paymentMethodId: Number(paymentMethodId),
								})
							}
						>
							{closeMutation.isPending && (
								<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
							)}
							Cobrar y cerrar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
