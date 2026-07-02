"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import { Combobox } from "@finopenpos/ui/components/combobox";
import { Input } from "@finopenpos/ui/components/input";
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import {
	Loader2Icon,
	MinusIcon,
	PlusIcon,
	ReceiptTextIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductImage } from "@/components/product-image";
import type { RouterOutputs } from "@/lib/trpc/router";
import { useTRPC } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/utils";

type Product = RouterOutputs["products"]["list"][number];
type POSProduct = Pick<
	Product,
	"id" | "name" | "price" | "in_stock" | "image_url"
> & {
	category: string;
	quantity: number;
};

export default function POSPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: products = [], isLoading: loadingProducts } = useQuery(
		trpc.products.list.queryOptions(),
	);
	const { data: customers = [], isLoading: loadingCustomers } = useQuery(
		trpc.customers.list.queryOptions(),
	);
	const { data: paymentMethods = [], isLoading: loadingMethods } = useQuery(
		trpc.paymentMethods.list.queryOptions(),
	);
	const t = useTranslations("pos");
	const tc = useTranslations("common");
	const tOrders = useTranslations("orders");
	const locale = useLocale();

	const [selectedProducts, setSelectedProducts] = useState<POSProduct[]>([]);
	const [paymentMethod, setPaymentMethod] = useState<{
		id: number;
		name: string;
	} | null>(null);
	const [selectedCustomer, setSelectedCustomer] = useState<{
		id: number;
		name: string;
	} | null>(null);
	const [productSearch, setProductSearch] = useState("");
	const [emitNfce, setEmitNfce] = useState(false);

	const loading = loadingProducts || loadingCustomers || loadingMethods;

	const createOrderMutation = useMutation(
		trpc.orders.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.orders.list.queryOptions());
				queryClient.invalidateQueries(trpc.products.list.queryOptions());
				toast.success(tOrders("createdSuccessfully"));
				setSelectedProducts([]);
				setSelectedCustomer(null);
				setPaymentMethod(null);
			},
			onError: (err) => toast.error(err.message || tOrders("createError")),
		}),
	);

	const filteredProducts = useMemo(() => {
		const term = productSearch.trim().toLowerCase();
		if (!term) return products;
		return products.filter(
			(product) =>
				product.name.toLowerCase().includes(term) ||
				(product.category ?? "").toLowerCase().includes(term),
		);
	}, [products, productSearch]);

	const handleSelectProduct = (productId: number | string) => {
		const product = products.find((item) => item.id === productId);
		if (!product) return;
		if (product.in_stock <= 0) {
			toast.error(t("outOfStock", { name: product.name }));
			return;
		}

		const existing = selectedProducts.find((item) => item.id === productId);
		if (existing && existing.quantity >= product.in_stock) {
			toast.error(t("limitedStock", { count: product.in_stock, name: product.name }));
			return;
		}

		if (existing) {
			setSelectedProducts((current) =>
				current.map((item) =>
					item.id === productId
						? { ...item, quantity: item.quantity + 1 }
						: item,
				),
			);
			return;
		}

		setSelectedProducts((current) => [
			...current,
			{
				id: product.id,
				name: product.name,
				price: product.price,
				in_stock: product.in_stock,
				image_url: product.image_url,
				category: product.category ?? "",
				quantity: 1,
			},
		]);
	};

	const handleSelectCustomer = (customerId: number | string) => {
		const customer = customers.find((item) => item.id === customerId);
		if (customer) setSelectedCustomer(customer);
	};

	const handleSelectPaymentMethod = (paymentMethodId: number | string) => {
		const method = paymentMethods.find((item) => item.id === paymentMethodId);
		if (method) setPaymentMethod(method);
	};

	const handleQuantityChange = (productId: number, delta: number) => {
		const product = products.find((item) => item.id === productId);
		setSelectedProducts((current) =>
			current.map((item) => {
				if (item.id !== productId) return item;
				const newQty = item.quantity + delta;
				if (newQty <= 0) return item;
				if (product && newQty > product.in_stock) {
					toast.error(t("limitedUnits", { count: product.in_stock }));
					return item;
				}
				return { ...item, quantity: newQty };
			}),
		);
	};

	const handleRemoveProduct = (productId: number) => {
		setSelectedProducts((current) =>
			current.filter((item) => item.id !== productId),
		);
	};

	const total = selectedProducts.reduce(
		(sum, product) => sum + product.price * product.quantity,
		0,
	);

	const canCreate = selectedProducts.length > 0 && selectedCustomer && paymentMethod;

	const handleCreateOrder = () => {
		if (!canCreate) return;
		createOrderMutation.mutate({
			customerId: selectedCustomer.id,
			paymentMethodId: paymentMethod.id,
			products: selectedProducts.map((product) => ({
				id: product.id,
				quantity: product.quantity,
				price: product.price,
			})),
			total,
		});
	};

	if (loading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	return (
		<div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[1fr_420px]">
			<div className="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>{t("saleDetails")}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-2">
						<Combobox
							items={customers}
							placeholder={t("selectCustomer")}
							onSelect={handleSelectCustomer}
						/>
						<Combobox
							items={paymentMethods}
							placeholder={t("selectPaymentMethod")}
							onSelect={handleSelectPaymentMethod}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("products")}</CardTitle>
						<div className="relative !mt-4">
							<SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="text"
								placeholder={t("searchPlaceholder")}
								value={productSearch}
								onChange={(event) => setProductSearch(event.target.value)}
								className="pl-8"
							/>
						</div>
					</CardHeader>
					<CardContent>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{filteredProducts.map((product) => {
								const selected = selectedProducts.find(
									(item) => item.id === product.id,
								);
								const disabled = product.in_stock <= 0;

								return (
									<button
										key={product.id}
										type="button"
										disabled={disabled}
										onClick={() => handleSelectProduct(product.id)}
										className={`overflow-hidden rounded-xl border bg-card text-left shadow-sm transition ${
											disabled
												? "cursor-not-allowed opacity-50"
												: "hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
										}`}
									>
										<ProductImage
											src={product.image_url}
											category={product.category}
											alt={product.name}
											className="h-32 w-full rounded-none"
										/>
										<div className="space-y-2 p-3">
											<div className="flex items-start justify-between gap-2">
												<div>
													<p className="line-clamp-2 font-semibold">
														{product.name}
													</p>
													<p className="text-muted-foreground text-xs">
														{product.category ?? "Sin categoría"}
													</p>
												</div>
												{selected && <Badge>x{selected.quantity}</Badge>}
											</div>
											<div className="flex items-center justify-between">
												<span className="font-bold text-primary">
													{formatCurrency(product.price, locale)}
												</span>
												<span className="text-muted-foreground text-xs">
													Stock: {product.in_stock}
												</span>
											</div>
										</div>
									</button>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="h-fit xl:sticky xl:top-20">
				<CardHeader>
					<CardTitle>Comanda</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{selectedProducts.length === 0 ? (
						<div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
							{t("selectProducts")}
						</div>
					) : (
						<div className="space-y-3">
							{selectedProducts.map((product) => {
								const source = products.find((item) => item.id === product.id);
								return (
									<div
										key={product.id}
										className="flex gap-3 rounded-xl border bg-card p-3"
									>
										<ProductImage
											src={product.image_url}
											category={product.category}
											alt={product.name}
											className="h-14 w-14"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-2">
												<div>
													<p className="truncate font-medium">{product.name}</p>
													<p className="text-muted-foreground text-xs">
														{formatCurrency(product.price, locale)} · Stock{" "}
														{source?.in_stock ?? 0}
													</p>
												</div>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 shrink-0"
													onClick={() => handleRemoveProduct(product.id)}
												>
													<Trash2Icon className="h-4 w-4" />
													<span className="sr-only">{tc("remove")}</span>
												</Button>
											</div>
											<div className="mt-3 flex items-center justify-between gap-2">
												<div className="flex items-center gap-1">
													<Button
														size="icon"
														variant="outline"
														className="h-8 w-8"
														onClick={() => handleQuantityChange(product.id, -1)}
														disabled={product.quantity <= 1}
													>
														<MinusIcon className="h-3 w-3" />
													</Button>
													<span className="w-9 text-center font-medium tabular-nums">
														{product.quantity}
													</span>
													<Button
														size="icon"
														variant="outline"
														className="h-8 w-8"
														onClick={() => handleQuantityChange(product.id, 1)}
														disabled={
															source ? product.quantity >= source.in_stock : false
														}
													>
														<PlusIcon className="h-3 w-3" />
													</Button>
												</div>
												<p className="font-semibold">
													{formatCurrency(
														product.quantity * product.price,
														locale,
													)}
												</p>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}

					<div className="space-y-4 border-t pt-4">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{tc("total")}</span>
							<strong className="text-2xl">{formatCurrency(total, locale)}</strong>
						</div>
						<label className="flex cursor-pointer select-none items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={emitNfce}
								onChange={(event) => setEmitNfce(event.target.checked)}
								className="h-4 w-4 rounded border-gray-300"
							/>
							<ReceiptTextIcon className="h-4 w-4 text-muted-foreground" />
							NFC-e
						</label>
						<Button
							onClick={handleCreateOrder}
							disabled={!canCreate || createOrderMutation.isPending}
							size="lg"
							className="w-full"
						>
							{createOrderMutation.isPending && (
								<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
							)}
							{t("createOrder")}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
