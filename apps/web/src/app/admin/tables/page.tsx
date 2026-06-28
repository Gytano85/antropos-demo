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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@finopenpos/ui/components/popover";
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
	Clock3Icon,
	DoorOpenIcon,
	Loader2Icon,
	PlusIcon,
	ReceiptIcon,
	Trash2Icon,
	TrendingDownIcon,
	TrendingUpIcon,
	UsersIcon,
	UtensilsIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/utils";
import { ProductPickerGrid } from "@/components/product-picker-grid";

export default function TablesPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const locale = useLocale();
	const t = useTranslations("tables");
	const tc = useTranslations("common");

	const { data: openTables = [], isLoading } = useQuery(
		trpc.tables.listOpen.queryOptions(),
	);
	const { data: products = [] } = useQuery(trpc.products.list.queryOptions());
	const { data: paymentMethods = [] } = useQuery(
		trpc.paymentMethods.list.queryOptions(),
	);
	const { data: pricingStatus } = useQuery(
		trpc.pricing.getStatus.queryOptions(undefined, { refetchInterval: 15_000 }),
	);

	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [newTableName, setNewTableName] = useState("");
	const [newPartySize, setNewPartySize] = useState(1);
	const [openDialog, setOpenDialog] = useState(false);
	const [closeDialog, setCloseDialog] = useState(false);
	const [productId, setProductId] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [paymentMethodId, setPaymentMethodId] = useState("");
	const [partySizeDraft, setPartySizeDraft] = useState<number | null>(null);

	const selectedTable =
		openTables.find((table) => table.id === selectedId) ??
		openTables[0] ??
		null;

	const selectedTableStatus = selectedTable
		? pricingStatus?.tables.find((table) => table.orderId === selectedTable.id)
		: undefined;

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries(trpc.tables.listOpen.queryOptions()),
			queryClient.invalidateQueries(trpc.orders.list.queryOptions()),
			queryClient.invalidateQueries(trpc.products.list.queryOptions()),
			queryClient.invalidateQueries(trpc.dashboard.stats.queryOptions()),
			queryClient.invalidateQueries(trpc.pricing.getStatus.queryOptions()),
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
				toast.success(t("opened"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const setPartySizeMutation = useMutation(
		trpc.tables.setPartySize.mutationOptions({
			onSuccess: async () => {
				setPartySizeDraft(null);
				await refresh();
				toast.success(t("partySizeUpdated"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const addMutation = useMutation(
		trpc.tables.addItem.mutationOptions({
			onSuccess: async () => {
				setProductId("");
				setQuantity(1);
				await refresh();
				toast.success(t("itemAdded"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const removeMutation = useMutation(
		trpc.tables.removeItem.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(t("itemRemoved"));
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
				toast.success(t("closed"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const availableProducts = useMemo(
		() => products.filter((product) => product.in_stock > 0),
		[products],
	);

	const selectedPickerProduct = availableProducts.find(
		(product) => String(product.id) === productId,
	);

	if (isLoading) {
		return (
			<div className="flex min-h-64 items-center justify-center">
				<Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[320px_1fr]">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>{t("openTables")}</CardTitle>
						<p className="mt-1 text-muted-foreground text-sm">
							{t("openCount", { count: openTables.length })}
						</p>
					</div>
					<Button size="sm" onClick={() => setOpenDialog(true)}>
						<PlusIcon className="mr-2 h-4 w-4" />
						{t("openTable")}
					</Button>
				</CardHeader>
				<CardContent className="space-y-2">
					{openTables.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
							<DoorOpenIcon className="h-10 w-10" />
							<p>{t("noOpenTables")}</p>
						</div>
					) : (
						openTables.map((table) => (
							<button
								key={table.id}
								type="button"
								onClick={() => {
									setSelectedId(table.id);
									setPartySizeDraft(null);
								}}
								className={`w-full rounded-lg border p-3 text-left transition-colors ${
									selectedTable?.id === table.id
										? "border-primary bg-accent"
										: "hover:bg-muted"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-semibold">
										{table.table_name ?? t("unnamedTable")}
									</span>
									<span className="font-medium text-sm">
										{formatCurrency(table.total_amount, locale)}
									</span>
								</div>
								<div className="mt-2 flex items-center gap-1 text-muted-foreground text-xs">
									<Clock3Icon className="h-3.5 w-3.5" />
									{table.created_at
										? new Date(table.created_at).toLocaleTimeString(locale, {
												hour: "2-digit",
												minute: "2-digit",
											})
										: ""}
									<span>·</span>
									<span>{t("items", { count: table.orderItems.length })}</span>
								</div>
							</button>
						))
					)}
				</CardContent>
			</Card>

			<Card>
				{selectedTable ? (
					<>
						<CardHeader className="flex flex-row items-center justify-between gap-4">
							<div>
								<CardTitle className="flex items-center gap-2">
									<UtensilsIcon className="h-5 w-5" />
									{selectedTable.table_name}
								</CardTitle>
								<p className="mt-1 text-muted-foreground text-sm">
									{t("activeCommand", { id: selectedTable.id })}
								</p>
							</div>
							<Button
								onClick={() => setCloseDialog(true)}
								disabled={selectedTable.orderItems.length === 0}
							>
								<ReceiptIcon className="mr-2 h-4 w-4" />
								{t("closeTable")}
							</Button>
						</CardHeader>
						<CardContent className="space-y-5">
							<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
								<div className="flex items-center gap-2">
									<UsersIcon className="h-4 w-4 text-muted-foreground" />
									<Label htmlFor="partySizeEdit" className="text-sm">
										{t("partySize")}
									</Label>
									<Input
										id="partySizeEdit"
										type="number"
										min={1}
										max={999}
										className="h-8 w-20"
										value={partySizeDraft ?? selectedTable.party_size}
										onChange={(event) =>
											setPartySizeDraft(
												Math.max(1, Number(event.target.value)),
											)
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
												{setPartySizeMutation.isPending && (
													<Loader2Icon className="mr-1 h-3.5 w-3.5 animate-spin" />
												)}
												{t("savePartySize")}
											</Button>
										)}
								</div>

								{pricingStatus?.settings.enabled &&
									pricingStatus.occupancyAdjustmentPct !== 0 && (
										<Badge
											variant={
												pricingStatus.occupancyAdjustmentPct > 0
													? "destructive"
													: "income"
											}
											className="gap-1"
										>
											{pricingStatus.occupancyAdjustmentPct > 0 ? (
												<TrendingUpIcon className="h-3.5 w-3.5" />
											) : (
												<TrendingDownIcon className="h-3.5 w-3.5" />
											)}
											{t("occupancyAdjustment", {
												pct:
													(pricingStatus.occupancyAdjustmentPct > 0
														? "+"
														: "") + pricingStatus.occupancyAdjustmentPct,
											})}
										</Badge>
									)}

								{selectedTableStatus?.flagged && (
									<Badge variant="destructive" className="gap-1">
										<AlertTriangleIcon className="h-3.5 w-3.5" />
										{t("possibleOverconsumption")}
									</Badge>
								)}
							</div>

							<div className="space-y-3 rounded-lg border bg-muted/30 p-3">
								<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className="w-full justify-start font-normal"
										>
											{selectedPickerProduct
												? `${selectedPickerProduct.name} · ${formatCurrency(selectedPickerProduct.price, locale)}`
												: t("selectProduct")}
										</Button>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										className="w-[min(92vw,32rem)] max-h-80 overflow-y-auto p-3"
									>
										<ProductPickerGrid
											products={availableProducts}
											onSelect={(id) => {
												setProductId(String(id));
												setPickerOpen(false);
											}}
											locale={locale}
											emptyMessage={tc("noItemFound")}
											outOfStockLabel={tc("outOfStock")}
											selectedIds={productId ? [Number(productId)] : []}
											className="grid-cols-3 sm:grid-cols-4"
										/>
									</PopoverContent>
								</Popover>
								<div className="flex gap-3 sm:grid sm:grid-cols-[100px_auto]">
									<Input
										type="number"
										min={1}
										value={quantity}
										onChange={(event) =>
											setQuantity(Math.max(1, Number(event.target.value)))
										}
									/>
									<Button
										className="flex-1"
										disabled={!productId || addMutation.isPending}
										onClick={() =>
											addMutation.mutate({
												orderId: selectedTable.id,
												productId: Number(productId),
												quantity,
											})
										}
									>
										{addMutation.isPending && (
											<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
										)}
										{tc("add")}
									</Button>
								</div>
							</div>

							<div className="overflow-x-auto rounded-lg border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("product")}</TableHead>
											<TableHead>{t("quantity")}</TableHead>
											<TableHead>{tc("price")}</TableHead>
											<TableHead>{tc("total")}</TableHead>
											<TableHead className="w-12" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{selectedTable.orderItems.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={5}
													className="h-28 text-center text-muted-foreground"
												>
													{t("emptyCommand")}
												</TableCell>
											</TableRow>
										) : (
											selectedTable.orderItems.map((item) => (
												<TableRow key={item.id}>
													<TableCell className="font-medium">
														{item.product?.name ?? t("deletedProduct")}
													</TableCell>
													<TableCell>{item.quantity}</TableCell>
													<TableCell>
														{formatCurrency(item.price, locale)}
													</TableCell>
													<TableCell>
														{formatCurrency(item.price * item.quantity, locale)}
													</TableCell>
													<TableCell>
														<Button
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
															<span className="sr-only">{tc("remove")}</span>
														</Button>
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>

							<div className="flex justify-end border-t pt-4">
								<div className="text-right">
									<p className="text-muted-foreground text-sm">{tc("total")}</p>
									<p className="font-bold text-3xl">
										{formatCurrency(selectedTable.total_amount, locale)}
									</p>
								</div>
							</div>
						</CardContent>
					</>
				) : (
					<CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
						<UtensilsIcon className="h-12 w-12" />
						<p>{t("selectOrOpen")}</p>
					</CardContent>
				)}
			</Card>

			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("openTable")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-3">
						<div className="space-y-2">
							<Label htmlFor="tableName">{t("tableName")}</Label>
							<Input
								id="tableName"
								autoFocus
								placeholder={t("tablePlaceholder")}
								value={newTableName}
								onChange={(event) => setNewTableName(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="partySize">{t("partySize")}</Label>
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
						<Button variant="secondary" onClick={() => setOpenDialog(false)}>
							{tc("cancel")}
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
							{t("startCommand")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={closeDialog} onOpenChange={setCloseDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("closeTable")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-3">
						<div className="rounded-lg bg-muted p-4 text-center">
							<p className="text-muted-foreground text-sm">
								{t("amountToPay")}
							</p>
							<p className="font-bold text-3xl">
								{formatCurrency(selectedTable?.total_amount ?? 0, locale)}
							</p>
						</div>
						<div className="space-y-2">
							<Label>{t("paymentMethod")}</Label>
							<Select
								value={paymentMethodId}
								onValueChange={setPaymentMethodId}
							>
								<SelectTrigger>
					