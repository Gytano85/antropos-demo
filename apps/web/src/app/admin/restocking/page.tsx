"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
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
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangleIcon,
	BoxIcon,
	CalendarClockIcon,
	SaveIcon,
	SearchIcon,
	ShoppingCartIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export default function RestockingPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [days, setDays] = useState<7 | 30 | 90>(30);
	const [leadTimeDays, setLeadTimeDays] = useState(7);
	const [coverageDays, setCoverageDays] = useState(14);
	const [safetyStockPct, setSafetyStockPct] = useState(25);
	const [urgentDays, setUrgentDays] = useState(3);
	const [soonDays, setSoonDays] = useState(7);
	const [search, setSearch] = useState("");

	const { data: savedSettings } = useQuery(
		trpc.restocking.getSettings.queryOptions(),
	);

	useEffect(() => {
		if (!savedSettings) return;
		setDays(savedSettings.historyDays);
		setLeadTimeDays(savedSettings.leadTimeDays);
		setCoverageDays(savedSettings.coverageDays);
		setSafetyStockPct(savedSettings.safetyStockPct);
		setUrgentDays(savedSettings.urgentDays);
		setSoonDays(savedSettings.soonDays);
	}, [savedSettings]);

	const rules = {
		historyDays: days,
		leadTimeDays,
		coverageDays,
		safetyStockPct,
		urgentDays,
		soonDays,
	};

	const saveSettings = useMutation(
		trpc.restocking.updateSettings.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.restocking.getSettings.queryOptions());
				queryClient.invalidateQueries(
					trpc.restocking.recommendations.queryOptions(rules),
				);
				toast.success("Reglas de reabasto guardadas");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const { data, isLoading } = useQuery(
		trpc.restocking.recommendations.queryOptions(rules),
	);

	const items = useMemo(() => {
		if (!data) return [];
		const term = search.trim().toLowerCase();
		return term
			? data.items.filter((item) => item.name.toLowerCase().includes(term))
			: data.items;
	}, [data, search]);

	const statusBadge = (status: (typeof items)[number]["status"]) => {
		if (status === "urgent") return <Badge variant="destructive">Urgente</Badge>;
		if (status === "soon") {
			return (
				<Badge className="border-amber-200 bg-amber-100 text-amber-800">
					Reordenar pronto
				</Badge>
			);
		}
		if (status === "healthy") {
			return (
				<Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
					Suficiente
				</Badge>
			);
		}
		return <Badge variant="outline">Sin demanda</Badge>;
	};

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-44 w-full" />
				<Skeleton className="h-80 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Reglas de reabastecimiento</CardTitle>
					<CardDescription>
						Calcula cuándo comprar según ventas reales, inventario virtual y
						tiempo de proveedor.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
					<div className="space-y-2">
						<Label>Historial de ventas</Label>
						<Select
							value={String(days)}
							onValueChange={(value) => setDays(Number(value) as 7 | 30 | 90)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="7">Últimos 7 días</SelectItem>
								<SelectItem value="30">Últimos 30 días</SelectItem>
								<SelectItem value="90">Últimos 90 días</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<NumberRule
						label="Días proveedor"
						value={leadTimeDays}
						min={1}
						max={60}
						onChange={setLeadTimeDays}
					/>
					<NumberRule
						label="Días cobertura"
						value={coverageDays}
						min={1}
						max={90}
						onChange={setCoverageDays}
					/>
					<NumberRule
						label="Reserva %"
						value={safetyStockPct}
						min={0}
						max={200}
						onChange={setSafetyStockPct}
					/>
					<NumberRule
						label="Urgente ≤ días"
						value={urgentDays}
						min={0}
						max={30}
						onChange={setUrgentDays}
					/>
					<NumberRule
						label="Pronto ≤ días"
						value={soonDays}
						min={1}
						max={60}
						onChange={setSoonDays}
					/>
					<div className="flex items-end">
						<button
							type="button"
							className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
							onClick={() => saveSettings.mutate(rules)}
						>
							<SaveIcon className="mr-2 h-4 w-4" />
							Guardar
						</button>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
				<SummaryCard icon={BoxIcon} label="Productos analizados" value={data.totalProducts} />
				<SummaryCard
					icon={AlertTriangleIcon}
					label="Compra urgente"
					value={data.urgentCount}
					accent="text-red-600"
				/>
				<SummaryCard
					icon={CalendarClockIcon}
					label="Reordenar pronto"
					value={data.soonCount}
					accent="text-amber-600"
				/>
				<SummaryCard
					icon={ShoppingCartIcon}
					label="Unidades sugeridas"
					value={data.recommendedUnits}
					accent="text-blue-600"
				/>
				<SummaryCard
					icon={AlertTriangleIcon}
					label="Inventario no coincide"
					value={data.mismatchCount}
					accent="text-purple-600"
				/>
			</div>

			<Card>
				<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle>Predicción de compras</CardTitle>
						<CardDescription>
							Fórmula: demanda diaria × días proveedor/cobertura + reserva. El
							stock al recibir predice si te quedas corto antes de que llegue el
							proveedor.
						</CardDescription>
					</div>
					<div className="relative w-full sm:w-72">
						<SearchIcon className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Buscar producto..."
							className="pl-9"
						/>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Producto</TableHead>
									<TableHead>Estado</TableHead>
									<TableHead className="text-right">Stock</TableHead>
									<TableHead className="text-right">Vendidas</TableHead>
									<TableHead className="text-right">Demanda/día</TableHead>
									<TableHead className="text-right">Días restantes</TableHead>
									<TableHead className="text-right">Stock al recibir</TableHead>
									<TableHead className="text-right">Punto reorden</TableHead>
									<TableHead className="text-right">No coincide</TableHead>
									<TableHead className="text-right">Comprar</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.productId}>
										<TableCell>
											<p className="font-medium">{item.name}</p>
											<p className="text-muted-foreground text-xs">
												{item.category ?? "Sin categoría"}
											</p>
										</TableCell>
										<TableCell>{statusBadge(item.status)}</TableCell>
										<TableCell className="text-right">{item.currentStock}</TableCell>
										<TableCell className="text-right">{item.unitsSold}</TableCell>
										<TableCell className="text-right">
											{item.averageDailyDemand.toFixed(2)}
										</TableCell>
										<TableCell className="text-right">
											{item.daysRemaining === null
												? "—"
												: `${item.daysRemaining} días`}
										</TableCell>
										<TableCell
											className={`text-right ${
												item.projectedStockAtLeadTime <= 0
													? "font-bold text-red-600"
													: ""
											}`}
										>
											{item.projectedStockAtLeadTime}
										</TableCell>
										<TableCell className="text-right">{item.reorderPoint}</TableCell>
										<TableCell className="text-right">
											{item.virtualMismatchUnits > 0 ? (
												<Badge variant="destructive">
													{item.virtualMismatchUnits}
												</Badge>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell className="text-right font-bold">
											{item.recommendedQuantity > 0
												? item.recommendedQuantity
												: "—"}
										</TableCell>
									</TableRow>
								))}
								{items.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={10}
											className="h-24 text-center text-muted-foreground"
										>
											No hay resultados.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function NumberRule({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) =>
					onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))
				}
			/>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	accent = "text-foreground",
}: {
	icon: LucideIcon;
	label: string;
	value: number;
	accent?: string;
}) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className={`font-bold text-3xl ${accent}`}>{value}</p>
				</div>
				<Icon className={`h-8 w-8 ${accent}`} />
			</CardContent>
		</Card>
	);
}
