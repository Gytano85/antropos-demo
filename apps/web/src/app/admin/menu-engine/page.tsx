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
import { useQuery } from "@tanstack/react-query";
import {
	BrainCircuitIcon,
	EyeIcon,
	ListFilterIcon,
	MenuIcon,
	SlidersHorizontalIcon,
	SparklesIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProductImage } from "@/components/product-image";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";
import { formatCurrency } from "@/lib/utils";

type EngineOutput = RouterOutputs["menuEngine"]["recommendations"];
type EngineItem = EngineOutput["items"][number];
type Weights = EngineOutput["weights"];
type Tab = "real" | "simulation";

const scenarios = [
	{ id: "none", label: "Sin escenario", note: "Usa los datos reales actuales." },
	{ id: "lemon_expiring", label: "Limón por vencer", note: "Prioriza productos que consumen limón." },
	{ id: "redbull_low_stock", label: "Red Bull bajo", note: "Baja productos con Red Bull escaso." },
	{ id: "wings_expiring", label: "Alitas por vencer", note: "Empuja alimentos que deben venderse pronto." },
	{ id: "tequila_overstock", label: "Tequila alto", note: "Sube botellas/cocteles con tequila." },
	{ id: "weekend_beer_push", label: "Fin de semana cerveza", note: "Reordena cervezas y cubetas." },
] as const;

const defaultWeights: Weights = {
	demand: 24,
	margin: 20,
	quality: 26,
	stock: 20,
	manual: 10,
};

export default function MenuEnginePage() {
	const trpc = useTRPC();
	const [tab, setTab] = useState<Tab>("real");
	const [scenario, setScenario] = useState<(typeof scenarios)[number]["id"]>("lemon_expiring");
	const [weights, setWeights] = useState<Weights>(defaultWeights);

	const realQuery = useQuery(
		trpc.menuEngine.recommendations.queryOptions({ weights, scenario: "none" }),
	);
	const simulationQuery = useQuery(
		trpc.menuEngine.recommendations.queryOptions({ weights, scenario }),
	);

	const active = tab === "real" ? realQuery.data : simulationQuery.data;

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="flex items-center gap-2 font-semibold text-2xl">
						<BrainCircuitIcon className="h-6 w-6 text-primary" />
						Motor del menú
					</h1>
					<p className="text-muted-foreground text-sm">
						Reglas internas para ordenar, destacar u ocultar productos del menú digital.
					</p>
				</div>
				<div className="flex rounded-lg border bg-background p-1">
					<Button variant={tab === "real" ? "default" : "ghost"} size="sm" onClick={() => setTab("real")}>
						Lógica real
					</Button>
					<Button variant={tab === "simulation" ? "default" : "ghost"} size="sm" onClick={() => setTab("simulation")}>
						Simulación demo
					</Button>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[320px_1fr]">
				<SettingsPanel weights={weights} setWeights={setWeights} tab={tab} scenario={scenario} setScenario={setScenario} />
				<div className="space-y-4">
					{tab === "real" ? (
						<RealLogicView data={active} isLoading={realQuery.isLoading} />
					) : (
						<SimulationView data={active} isLoading={simulationQuery.isLoading} scenario={scenario} />
					)}
				</div>
			</div>
		</div>
	);
}

function SettingsPanel({
	weights,
	setWeights,
	tab,
	scenario,
	setScenario,
}: {
	weights: Weights;
	setWeights: (weights: Weights) => void;
	tab: Tab;
	scenario: string;
	setScenario: (scenario: (typeof scenarios)[number]["id"]) => void;
}) {
	const update = (key: keyof Weights, value: number) =>
		setWeights({ ...weights, [key]: Math.max(0, Math.min(100, value)) });

	return (
		<Card className="self-start xl:sticky xl:top-4">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SlidersHorizontalIcon className="h-5 w-5" />
					Parámetros
				</CardTitle>
				<CardDescription>
					Estos pesos cambian la prioridad del cálculo. No modifican inventario ni ventas.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<WeightField label="Demanda" value={weights.demand} onChange={(value) => update("demand", value)} />
				<WeightField label="Margen" value={weights.margin} onChange={(value) => update("margin", value)} />
				<WeightField label="Calidad / vida útil" value={weights.quality} onChange={(value) => update("quality", value)} />
				<WeightField label="Stock disponible" value={weights.stock} onChange={(value) => update("stock", value)} />
				<WeightField label="Empuje manual" value={weights.manual} onChange={(value) => update("manual", value)} />

				{tab === "simulation" && (
					<div className="space-y-2 border-t pt-4">
						<Label>Escenario fake</Label>
						<Select value={scenario} onValueChange={(value) => setScenario(value as (typeof scenarios)[number]["id"])}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{scenarios.map((item) => (
									<SelectItem key={item.id} value={item.id}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{scenarios.find((item) => item.id === scenario)?.note}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function WeightField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<Label>{label}</Label>
				<Input
					type="number"
					min={0}
					max={100}
					className="h-8 w-20 text-right"
					value={value}
					onChange={(event) => onChange(Number(event.target.value))}
				/>
			</div>
			<input
				type="range"
				min={0}
				max={100}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="w-full accent-primary"
			/>
		</div>
	);
}

function RealLogicView({ data, isLoading }: { data?: EngineOutput; isLoading: boolean }) {
	if (isLoading || !data) return <LoadingCard />;
	return (
		<div className="space-y-4">
			<SummaryCards data={data} />
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ListFilterIcon className="h-5 w-5" />
						Decisiones con datos actuales
					</CardTitle>
					<CardDescription>
						Esta vista es interna: muestra qué haría el menú y por qué.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DecisionTable items={data.items} />
				</CardContent>
			</Card>
		</div>
	);
}

function SimulationView({
	data,
	isLoading,
	scenario,
}: {
	data?: EngineOutput;
	isLoading: boolean;
	scenario: string;
}) {
	if (isLoading || !data) return <LoadingCard />;
	return (
		<div className="space-y-4">
			<Card className="border-amber-200 bg-amber-50/60">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SparklesIcon className="h-5 w-5 text-amber-700" />
						Simulación para presentación
					</CardTitle>
					<CardDescription>
						Escenario: {scenarios.find((item) => item.id === scenario)?.label}. No cambia datos reales.
					</CardDescription>
				</CardHeader>
			</Card>
			<MenuPreview data={data} />
			<Card>
				<CardHeader>
					<CardTitle>Explicación interna del escenario</CardTitle>
					<CardDescription>
						Esto es para ti, no para mostrar en el menú del cliente.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DecisionTable items={data.items.slice(0, 12)} />
				</CardContent>
			</Card>
		</div>
	);
}

function SummaryCards({ data }: { data: EngineOutput }) {
	return (
		<div className="grid gap-3 md:grid-cols-4">
			<Metric label="Productos evaluados" value={data.items.length} />
			<Metric label="Destacar" value={data.items.filter((item) => item.action === "Destacar").length} />
			<Metric label="Promover" value={data.items.filter((item) => item.action === "Promover").length} />
			<Metric label="Ocultar" value={data.hidden.length} />
		</div>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<Card>
			<CardContent className="pt-5">
				<p className="text-muted-foreground text-sm">{label}</p>
				<p className="font-bold text-3xl">{value}</p>
			</CardContent>
		</Card>
	);
}

function DecisionTable({ items }: { items: EngineItem[] }) {
	return (
		<div className="overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Producto</TableHead>
						<TableHead>Acción</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Stock</TableHead>
						<TableHead>Calidad</TableHead>
						<TableHead>Por qué</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell>
								<p className="font-medium">{item.name}</p>
								<p className="text-muted-foreground text-xs">{item.categoryLabel}</p>
							</TableCell>
							<TableCell><ActionBadge action={item.action} /></TableCell>
							<TableCell className="font-semibold">{item.score}</TableCell>
							<TableCell>
								<p>{item.stockStatus}</p>
								<p className="text-muted-foreground text-xs">{item.available} vendibles</p>
							</TableCell>
							<TableCell>{item.qualityStatus}</TableCell>
							<TableCell className="min-w-[320px]">
								<ul className="list-disc space-y-1 pl-4 text-muted-foreground text-xs">
									{item.reasons.slice(0, 5).map((reason) => (
										<li key={reason}>{reason}</li>
									))}
								</ul>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ActionBadge({ action }: { action: string }) {
	if (action === "Destacar") return <Badge className="bg-emerald-600">Destacar</Badge>;
	if (action === "Promover") return <Badge className="bg-blue-600">Promover</Badge>;
	if (action === "Bajar") return <Badge className="bg-amber-600">Bajar</Badge>;
	if (action === "Ocultar") return <Badge variant="destructive">Ocultar</Badge>;
	return <Badge variant="outline">Mantener</Badge>;
}

function MenuPreview({ data }: { data: EngineOutput }) {
	const hero = data.hero;
	const highlights = data.highlights.slice(1, 5);
	const sections = useMemo(
		() =>
			data.sections.map((section) => ({
				...section,
				items: data.items.filter((item) => item.category === section.category && item.action !== "Ocultar").slice(0, 6),
			})),
		[data],
	);

	return (
		<Card className="overflow-hidden bg-[#070707] text-white">
			<CardHeader className="border-white/10 border-b">
				<CardTitle className="flex items-center gap-2">
					<EyeIcon className="h-5 w-5" />
					Vista del menú modificado
				</CardTitle>
				<CardDescription className="text-white/60">
					Así se vería para presentación, sin explicar la lógica al cliente.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-8 p-5">
				{hero && (
					<div className="grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] md:grid-cols-[1fr_1.2fr]">
						<ProductImage src={hero.imageUrl} category={hero.category} alt={hero.name} className="h-64 rounded-none" />
						<div className="flex flex-col justify-center p-6">
							<Badge className="mb-3 w-fit bg-[#d6b15f] text-black">{hero.customerTag}</Badge>
							<h2 className="font-bold text-4xl">{hero.name}</h2>
							<p className="mt-2 text-white/65">{hero.description}</p>
							<p className="mt-6 font-bold text-3xl text-[#d6b15f]">{formatCurrency(hero.price, "es-MX")}</p>
						</div>
					</div>
				)}

				<div>
					<h3 className="mb-3 font-semibold text-xl">Recomendados de la noche</h3>
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{highlights.map((item) => (
							<MenuCard key={item.id} item={item} />
						))}
					</div>
				</div>

				{sections.map((section) => (
					<div key={section.category}>
						<div className="mb-3 flex items-end justify-between gap-3">
							<div>
								<p className="text-[#d6b15f] text-xs uppercase tracking-[0.24em]">Carta</p>
								<h3 className="font-semibold text-2xl">{section.label}</h3>
							</div>
							<span className="rounded-full border border-white/10 px-3 py-1 text-white/50 text-xs">
								{section.items.length} opciones
							</span>
						</div>
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{section.items.map((item) => (
								<MenuCard key={item.id} item={item} compact />
							))}
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function MenuCard({ item, compact = false }: { item: EngineItem; compact?: boolean }) {
	return (
		<div className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] ${compact ? "flex" : ""}`}>
			<ProductImage
				src={item.imageUrl}
				category={item.category}
				alt={item.name}
				className={compact ? "h-24 w-24 shrink-0 rounded-none" : "h-36 rounded-none"}
			/>
			<div className="min-w-0 flex-1 p-3">
				<div className="mb-2 flex items-center gap-2">
					<Badge className="bg-white/10 text-white">{item.customerTag}</Badge>
				</div>
				<p className="font-semibold">{item.name}</p>
				<p className="line-clamp-2 text-white/55 text-xs">{item.description}</p>
				<p className="mt-2 font-bold text-[#d6b15f]">{formatCurrency(item.price, "es-MX")}</p>
			</div>
		</div>
	);
}

function LoadingCard() {
	return (
		<Card>
			<CardContent className="flex h-64 items-center justify-center text-muted-foreground">
				Calculando menú...
			</CardContent>
		</Card>
	);
}
