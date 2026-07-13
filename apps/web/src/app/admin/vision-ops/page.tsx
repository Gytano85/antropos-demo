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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@finopenpos/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ActivityIcon,
	AlertTriangleIcon,
	BoxIcon,
	CameraIcon,
	CheckCircle2Icon,
	ChefHatIcon,
	CircleDotIcon,
	CrosshairIcon,
	EyeIcon,
	FlameIcon,
	GaugeIcon,
	LockIcon,
	ReceiptTextIcon,
	ScaleIcon,
	ShieldAlertIcon,
	ThermometerIcon,
	TimerIcon,
	VideoIcon,
	ZapIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

type Tab = "sources" | "zones" | "rules" | "audit" | "demo";
type Risk = "ok" | "medium" | "high" | "critical";
type SourceKind = "camera" | "sensor" | "scale" | "temperature" | "vms";
type ScenarioId = "premium" | "weight" | "kitchen" | "cold-chain" | "warehouse";

const tabs: Array<{ id: Tab; label: string }> = [
	{ id: "sources", label: "Fuentes" },
	{ id: "zones", label: "Zonas" },
	{ id: "rules", label: "Reglas" },
	{ id: "audit", label: "Auditoría" },
	{ id: "demo", label: "Simulador" },
];

type SourceRow = {
	name: string;
	kind: SourceKind;
	zone: string;
	signal: string;
	status: "online" | "ready" | "offline";
	softwareFirst: boolean;
};
type ZoneRow = {
	name: string;
	purpose: string;
	posContext: string;
	events: string[];
	icon: ComponentType<{ className?: string }>;
};
type RuleRow = {
	name: string;
	observed: string;
	expected: string;
	check: string;
	risk: Risk;
};
type AuditRow = {
	time: string;
	zone: string;
	event: string;
	pos: string;
	inventory: string;
	result: string;
	risk: Risk;
};

const sources: Array<{
	name: string;
	kind: SourceKind;
	zone: string;
	signal: string;
	status: "online" | "ready" | "offline";
	softwareFirst: boolean;
}> = [
	{
		name: "Cámara barra principal",
		kind: "camera",
		zone: "Barra",
		signal: "Movimiento, permanencia y cruce de línea",
		status: "online",
		softwareFirst: true,
	},
	{
		name: "Cámara cava premium",
		kind: "vms",
		zone: "Cava",
		signal: "Actividad en repisa y clip de evidencia",
		status: "online",
		softwareFirst: true,
	},
	{
		name: "Cámara pase de cocina",
		kind: "camera",
		zone: "Cocina",
		signal: "Salida de platos vs comandas listas",
		status: "online",
		softwareFirst: true,
	},
	{
		name: "Sensor puerta refrigerador",
		kind: "sensor",
		zone: "Refrigerador",
		signal: "Apertura, cierre y tiempo abierto",
		status: "ready",
		softwareFirst: false,
	},
	{
		name: "Báscula botella Don Julio 70",
		kind: "scale",
		zone: "Cava",
		signal: "Cambio de peso contra consumo por receta",
		status: "ready",
		softwareFirst: false,
	},
	{
		name: "Sensor temperatura cocina fría",
		kind: "temperature",
		zone: "Calidad",
		signal: "Temperatura fuera de rango",
		status: "ready",
		softwareFirst: false,
	},
];

const zones: Array<{
	name: string;
	purpose: string;
	posContext: string;
	events: string[];
	icon: ComponentType<{ className?: string }>;
}> = [
	{
		name: "Barra",
		purpose: "Detectar actividad de servido y permanencia detrás de barra.",
		posContext: "Ventas de bebidas, recetas, empleado en turno.",
		events: ["motion_burst", "person_in_zone", "served_candidate"],
		icon: FlameIcon,
	},
	{
		name: "Cava",
		purpose:
			"Controlar botellas premium sin depender de reconocer cada etiqueta.",
		posContext: "Ventas premium, inventario esperado, permisos de bodega.",
		events: ["door_opened", "shelf_activity", "weight_decreased"],
		icon: LockIcon,
	},
	{
		name: "Cocina",
		purpose: "Cruzar salida física de platos contra comandas listas.",
		posContext: "Comandas activas, estado de cocina, mesa y mesero.",
		events: ["plate_crossed_line", "station_occupied", "order_ready_timeout"],
		icon: ChefHatIcon,
	},
	{
		name: "Refrigerador",
		purpose: "Detectar riesgo de calidad y apertura sin operación compatible.",
		posContext: "Productos perecederos, vida útil y calidad.",
		events: ["door_open_too_long", "temperature_out_of_range"],
		icon: ThermometerIcon,
	},
	{
		name: "Almacén",
		purpose: "Auditar entradas, salidas y transferencias internas.",
		posContext: "Transferencias, turnos, permisos e inventario real.",
		events: ["line_crossed", "person_in_restricted_zone"],
		icon: BoxIcon,
	},
];

const rules: Array<{
	name: string;
	observed: string;
	expected: string;
	check: string;
	risk: Risk;
}> = [
	{
		name: "Actividad en cava sin venta compatible",
		observed: "Cámara/sensor detecta apertura o movimiento en cava.",
		expected: "Venta premium, transferencia o empleado autorizado.",
		check: "Ventana de 90 segundos contra POS e inventario.",
		risk: "high",
	},
	{
		name: "Peso baja más que receta",
		observed: "Báscula reporta pérdida de peso en botella.",
		expected: "Consumo calculado por recetas vendidas.",
		check: "Diferencia contra tolerancia configurable.",
		risk: "critical",
	},
	{
		name: "Plato sale sin comanda lista",
		observed: "Cruce en pase de cocina.",
		expected: "Comanda lista y mesa asociada.",
		check: "Mesa/producto/tiempo de cocina.",
		risk: "medium",
	},
	{
		name: "Refrigerador abierto demasiado tiempo",
		observed: "Puerta abierta y/o temperatura fuera de rango.",
		expected: "Apertura breve durante operación normal.",
		check: "Umbral por producto y zona de calidad.",
		risk: "medium",
	},
	{
		name: "Caja abierta sin transacción",
		observed: "Evento visual/sensor de caja abierta.",
		expected: "Venta, devolución, retiro o corte.",
		check: "Transacción en ventana de tiempo.",
		risk: "critical",
	},
];

const auditEvents: Array<{
	time: string;
	zone: string;
	event: string;
	pos: string;
	inventory: string;
	result: string;
	risk: Risk;
}> = [
	{
		time: "22:14:03",
		zone: "Cocina",
		event: "2 platos cruzan pase",
		pos: "Mesa 7 tenía 2 platillos listos",
		inventory: "Ingredientes descontados por receta",
		result: "Cuadra",
		risk: "ok",
	},
	{
		time: "23:08:12",
		zone: "Cava",
		event: "Movimiento en repisa premium",
		pos: "Sin venta premium ±90s",
		inventory: "Don Julio 70 ya tenía diferencia",
		result: "Revisar clip",
		risk: "high",
	},
	{
		time: "23:31:09",
		zone: "Almacén",
		event: "Cruce físico hacia barra",
		pos: "Sin transferencia activa",
		inventory: "Caja de cerveza no registrada",
		result: "Salida no justificada",
		risk: "critical",
	},
	{
		time: "00:04:50",
		zone: "Caja",
		event: "Caja abierta",
		pos: "Sin venta/retiro/corte",
		inventory: "No aplica",
		result: "Auditoría de efectivo",
		risk: "critical",
	},
];

const scenarios = [
	{
		id: "premium" as const,
		title: "Cava premium sin venta",
		description: "Simula movimiento en cava y ausencia de venta compatible.",
		risk: "high" as Risk,
		findings: [
			"Cámara detecta actividad en repisa premium.",
			"No existe venta premium en ventana de 90 segundos.",
			"Inventario esperado ya muestra diferencia en botella.",
			"Se genera incidente con clip y contexto POS.",
		],
	},
	{
		id: "weight" as const,
		title: "Botella baja más de lo esperado",
		description: "Simula una báscula reportando más consumo que las recetas.",
		risk: "critical" as Risk,
		findings: [
			"Báscula reporta pérdida de 240 ml.",
			"Recetas vendidas justifican 135 ml.",
			"La diferencia supera la tolerancia configurada.",
			"Se vincula a producto, turno y ventas cercanas.",
		],
	},
	{
		id: "kitchen" as const,
		title: "Plato sin comanda lista",
		description: "Simula salida física de cocina sin orden compatible.",
		risk: "medium" as Risk,
		findings: [
			"Cruce detectado en línea de pase.",
			"No hay comanda lista en esa ventana.",
			"Se guarda evidencia para revisión operativa.",
			"El evento puede explicar diferencia de insumos.",
		],
	},
] as const;

export default function VisionOpsPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<Tab>("sources");
	const [scenarioId, setScenarioId] = useState<ScenarioId>(
		scenarios[0]?.id ?? "premium",
	);
	const { data } = useQuery(trpc.visionOps.overview.queryOptions());
	const simulateIncident = useMutation(
		trpc.visionOps.simulateIncident.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(
					trpc.visionOps.overview.queryOptions(),
				);
			},
		}),
	);
	const scenario = useMemo(
		() => scenarios.find((item) => item.id === scenarioId) ?? scenarios[0],
		[scenarioId],
	);
	const sourceRows = useMemo<SourceRow[]>(
		() =>
			data?.sources.map((source) => ({
				name: source.name,
				kind: source.kind as SourceKind,
				zone: source.zone,
				signal: source.signal,
				status: source.status as SourceRow["status"],
				softwareFirst: source.software_first,
			})) ?? sources,
		[data?.sources],
	);
	const zoneRows = useMemo<ZoneRow[]>(
		() =>
			data?.zones.map((zone) => ({
				name: zone.name,
				purpose: zone.purpose,
				posContext: zone.pos_context,
				events: zone.events,
				icon: iconForZone(zone.name),
			})) ?? zones,
		[data?.zones],
	);
	const ruleRows = useMemo<RuleRow[]>(
		() =>
			data?.rules.map((rule) => ({
				name: rule.name,
				observed: rule.observed,
				expected: rule.expected,
				check: rule.check_text,
				risk: rule.risk,
			})) ?? rules,
		[data?.rules],
	);
	const auditRows = useMemo<AuditRow[]>(
		() =>
			data?.incidents.map((incident) => ({
				time: formatIncidentTime(incident.created_at),
				zone: incident.zone,
				event: incident.event,
				pos: incident.pos_context,
				inventory: incident.inventory_context,
				result: incident.result,
				risk: incident.risk,
			})) ?? auditEvents,
		[data?.incidents],
	);
	const metrics = data?.metrics;

	return (
		<div className="space-y-6">
			<section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-neutral-900 p-6 text-white shadow-sm">
				<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
					<div>
						<Badge className="mb-4 bg-amber-400 text-black hover:bg-amber-400">
							Control visual operativo
						</Badge>
						<h1 className="max-w-3xl font-semibold text-3xl tracking-tight md:text-4xl">
							Cámaras, sensores y POS convertidos en auditoría de operación.
						</h1>
						<p className="mt-4 max-w-3xl text-slate-300">
							La cámara no acusa sola. El sistema cruza movimiento físico,
							ventas, recetas, inventario, empleados y calidad para detectar
							discrepancias verificables.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
						<HeroMetric
							icon={CameraIcon}
							label="Fuentes configuradas"
							value={String(metrics?.sourceCount ?? sourceRows.length)}
						/>
						<HeroMetric
							icon={ShieldAlertIcon}
							label="Reglas activas"
							value={String(metrics?.ruleCount ?? ruleRows.length)}
						/>
						<HeroMetric icon={ZapIcon} label="Mayoría software" value="Sí" />
					</div>
				</div>
			</section>

			<div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2">
				{tabs.map((tab) => (
					<Button
						key={tab.id}
						type="button"
						variant={activeTab === tab.id ? "default" : "ghost"}
						size="sm"
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</Button>
				))}
			</div>

			{activeTab === "sources" ? <SourcesSection sources={sourceRows} /> : null}
			{activeTab === "zones" ? <ZonesSection zones={zoneRows} /> : null}
			{activeTab === "rules" ? <RulesSection rules={ruleRows} /> : null}
			{activeTab === "audit" ? (
				<AuditSection events={auditRows} metrics={metrics} />
			) : null}
			{activeTab === "demo" ? (
				<DemoSection
					scenario={scenario}
					scenarioId={scenarioId}
					onScenarioChange={setScenarioId}
					onRunScenario={(id) => simulateIncident.mutate({ scenario: id })}
					isRunning={simulateIncident.isPending}
				/>
			) : null}
		</div>
	);
}

function SourcesSection({ sources }: { sources: SourceRow[] }) {
	return (
		<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
			<Card>
				<CardHeader>
					<CardTitle>Fuentes de señal</CardTitle>
					<CardDescription>
						Cámaras existentes primero; sensores ligeros solo donde aumentan
						confiabilidad.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Fuente</TableHead>
								<TableHead>Zona</TableHead>
								<TableHead>Señal</TableHead>
								<TableHead>Estado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sources.map((source) => (
								<TableRow key={source.name}>
									<TableCell>
										<div className="font-medium">{source.name}</div>
										<div className="text-muted-foreground text-xs">
											{source.softwareFirst
												? "Software sobre cámara/VMS"
												: "Sensor opcional de bajo costo"}
										</div>
									</TableCell>
									<TableCell>{source.zone}</TableCell>
									<TableCell>{source.signal}</TableCell>
									<TableCell>
										<SourceBadge status={source.status} kind={source.kind} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Principio técnico</CardTitle>
					<CardDescription>
						No entrenar un modelo por restaurante.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Principle
						icon={CrosshairIcon}
						title="Zonas antes que objetos"
						text="Se detecta actividad en zonas controladas y se cruza con POS."
					/>
					<Principle
						icon={ScaleIcon}
						title="Sensor cuando conviene"
						text="Una báscula o puerta puede validar mejor que una cámara mal colocada."
					/>
					<Principle
						icon={EyeIcon}
						title="Modelo como verificador"
						text="YOLOE, YOLO-World o Grounding DINO verifican snapshots puntuales, no gobiernan todo."
					/>
				</CardContent>
			</Card>

			<Card className="xl:col-span-2">
				<CardHeader>
					<CardTitle>Ingesta externa</CardTitle>
					<CardDescription>
						Endpoint para sensores, básculas, barreras IR/láser o webhooks de
						cámaras/VMS.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-3">
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">URL</div>
						<code className="mt-2 block break-all text-sm">
							POST /api/vision-ops/signals
						</code>
					</div>
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">Header</div>
						<code className="mt-2 block break-all text-sm">
							x-vision-ops-token
						</code>
					</div>
					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="text-muted-foreground text-sm">Token local</div>
						<code className="mt-2 block break-all text-sm">dev-demo-token</code>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ZonesSection({ zones }: { zones: ZoneRow[] }) {
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			{zones.map((zone) => (
				<Card key={zone.name}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<zone.icon className="h-5 w-5 text-primary" />
							{zone.name}
						</CardTitle>
						<CardDescription>{zone.purpose}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-2xl border bg-muted/40 p-4 text-sm">
							<div className="font-medium">Contexto POS</div>
							<div className="mt-1 text-muted-foreground">
								{zone.posContext}
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							{zone.events.map((event) => (
								<Badge key={event} variant="outline">
									{event}
								</Badge>
							))}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function RulesSection({ rules }: { rules: RuleRow[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Reglas cruzadas</CardTitle>
				<CardDescription>
					Cada regla compara señal física contra lo que el POS/inventario
					esperaban.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Regla</TableHead>
							<TableHead>Observado</TableHead>
							<TableHead>Esperado</TableHead>
							<TableHead>Validación</TableHead>
							<TableHead>Riesgo</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rules.map((rule) => (
							<TableRow key={rule.name}>
								<TableCell className="font-medium">{rule.name}</TableCell>
								<TableCell>{rule.observed}</TableCell>
								<TableCell>{rule.expected}</TableCell>
								<TableCell>{rule.check}</TableCell>
								<TableCell>
									<RiskBadge risk={rule.risk} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function AuditSection({
	events,
	metrics,
}: {
	events: AuditRow[];
	metrics?: {
		incidentCount: number;
		reviewCount: number;
		posLinkedPct: number;
		latencyLabel: string;
	};
}) {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-4">
				<Metric
					icon={ActivityIcon}
					label="Eventos hoy"
					value={String(metrics?.incidentCount ?? events.length)}
				/>
				<Metric
					icon={AlertTriangleIcon}
					label="A revisar"
					value={String(metrics?.reviewCount ?? events.length)}
				/>
				<Metric
					icon={ReceiptTextIcon}
					label="Con POS ligado"
					value={`${metrics?.posLinkedPct ?? 91}%`}
				/>
				<Metric
					icon={TimerIcon}
					label="Latencia promedio"
					value={metrics?.latencyLabel ?? "2.4s"}
				/>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Auditoría de eventos</CardTitle>
					<CardDescription>
						La tabla muestra evento físico, contexto POS, inventario y
						resultado.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Hora</TableHead>
								<TableHead>Zona</TableHead>
								<TableHead>Evento físico</TableHead>
								<TableHead>POS</TableHead>
								<TableHead>Inventario/calidad</TableHead>
								<TableHead>Resultado</TableHead>
								<TableHead>Riesgo</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((event) => (
								<TableRow key={`${event.time}-${event.zone}`}>
									<TableCell>{event.time}</TableCell>
									<TableCell>{event.zone}</TableCell>
									<TableCell>{event.event}</TableCell>
									<TableCell>{event.pos}</TableCell>
									<TableCell>{event.inventory}</TableCell>
									<TableCell>{event.result}</TableCell>
									<TableCell>
										<RiskBadge risk={event.risk} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

function DemoSection({
	scenario,
	scenarioId,
	onScenarioChange,
	onRunScenario,
	isRunning,
}: {
	scenario: (typeof scenarios)[number];
	scenarioId: ScenarioId;
	onScenarioChange: (id: ScenarioId) => void;
	onRunScenario: (id: ScenarioId) => void;
	isRunning: boolean;
}) {
	return (
		<div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
			<Card>
				<CardHeader>
					<CardTitle>Escenarios de presentación</CardTitle>
					<CardDescription>
						Simulan datos sin cambiar ventas reales, inventario real ni
						configuración.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{scenarios.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onScenarioChange(item.id)}
							className={`w-full rounded-2xl border p-4 text-left transition ${
								scenarioId === item.id
									? "border-primary bg-primary/10"
									: "bg-background hover:bg-muted/60"
							}`}
						>
							<div className="flex items-center justify-between gap-3">
								<div className="font-semibold">{item.title}</div>
								<RiskBadge risk={item.risk} />
							</div>
							<div className="mt-1 text-muted-foreground text-sm">
								{item.description}
							</div>
						</button>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<VideoIcon className="h-5 w-5" />
						{scenario.title}
					</CardTitle>
					<CardDescription>
						Vista de evidencia: evento físico + POS + inventario + resultado.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="relative overflow-hidden rounded-3xl border bg-slate-950 p-5 text-white">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.25),transparent_25%),radial-gradient(circle_at_80%_50%,rgba(59,130,246,0.22),transparent_30%)]" />
						<div className="relative min-h-64">
							<div className="flex items-center justify-between">
								<Badge className="bg-white text-black hover:bg-white">
									Clip demo
								</Badge>
								<RiskBadge risk={scenario.risk} />
							</div>
							<div className="mt-16 grid gap-3 md:grid-cols-4">
								<SignalBox
									icon={CameraIcon}
									title="Cámara"
									text="Persona y zona"
								/>
								<SignalBox
									icon={CrosshairIcon}
									title="LÃ¡ser / IR"
									text="Cruce fÃ­sico"
								/>
								<SignalBox
									icon={ScaleIcon}
									title="Sensor"
									text="Peso o puerta"
								/>
								<SignalBox
									icon={ReceiptTextIcon}
									title="POS"
									text="Contexto cruzado"
								/>
							</div>
						</div>
					</div>

					<div className="rounded-2xl border bg-muted/40 p-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div>
								<div className="font-semibold">SesiÃ³n fusionada</div>
								<div className="text-muted-foreground text-sm">
									El sistema decide por continuidad, no por una sola predicciÃ³n.
								</div>
							</div>
							<Badge variant="outline">cÃ¡mara + lÃ¡ser + POS</Badge>
						</div>
						<div className="grid gap-2 text-sm md:grid-cols-3">
							<div className="rounded-xl border bg-background p-3">
								<div className="text-muted-foreground">DuraciÃ³n</div>
								<div className="font-semibold">16s en zona</div>
							</div>
							<div className="rounded-xl border bg-background p-3">
								<div className="text-muted-foreground">Confianza fusionada</div>
								<div className="font-semibold">alta, multi-seÃ±al</div>
							</div>
							<div className="rounded-xl border bg-background p-3">
								<div className="text-muted-foreground">ValidaciÃ³n</div>
								<div className="font-semibold">venta / traspaso / receta</div>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						{scenario.findings.map((finding) => (
							<div
								key={finding}
								className="flex gap-3 rounded-2xl border p-3 text-sm"
							>
								<CircleDotIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
								<span>{finding}</span>
							</div>
						))}
					</div>
					<Button
						type="button"
						className="w-full"
						disabled={isRunning}
						onClick={() => onRunScenario(scenarioId)}
					>
						{isRunning ? "Registrando evento..." : "Registrar escenario demo"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function iconForZone(zoneName: string): ComponentType<{ className?: string }> {
	const normalized = zoneName.toLowerCase();
	if (normalized.includes("barra")) return FlameIcon;
	if (normalized.includes("cava")) return LockIcon;
	if (normalized.includes("cocina")) return ChefHatIcon;
	if (normalized.includes("refrigerador")) return ThermometerIcon;
	if (normalized.includes("almac")) return BoxIcon;
	return CrosshairIcon;
}

function formatIncidentTime(value: string | null) {
	if (!value) return "--:--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value.slice(0, 5);
	return date.toLocaleTimeString("es-MX", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function HeroMetric({
	icon: Icon,
	label,
	value,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string;
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
			<div className="mb-2 flex items-center gap-2 text-slate-300 text-sm">
				<Icon className="h-4 w-4" />
				{label}
			</div>
			<div className="font-semibold text-2xl">{value}</div>
		</div>
	);
}

function Metric({
	icon: Icon,
	label,
	value,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string;
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
					<Icon className="h-4 w-4" />
					{label}
				</div>
				<div className="font-semibold text-2xl">{value}</div>
			</CardContent>
		</Card>
	);
}

function Principle({
	title,
	text,
	icon: Icon,
}: {
	title: string;
	text: string;
	icon: ComponentType<{ className?: string }>;
}) {
	return (
		<div className="rounded-2xl border p-4">
			<Icon className="mb-3 h-5 w-5 text-primary" />
			<div className="font-semibold">{title}</div>
			<div className="mt-1 text-muted-foreground text-sm">{text}</div>
		</div>
	);
}

function SignalBox({
	icon: Icon,
	title,
	text,
}: {
	icon: ComponentType<{ className?: string }>;
	title: string;
	text: string;
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/10 p-4">
			<Icon className="mb-3 h-5 w-5 text-amber-300" />
			<div className="font-semibold">{title}</div>
			<div className="text-slate-300 text-sm">{text}</div>
		</div>
	);
}

function SourceBadge({ status, kind }: { status: string; kind: SourceKind }) {
	if (status === "offline") {
		return <Badge variant="destructive">Offline</Badge>;
	}

	const labelByKind: Record<SourceKind, string> = {
		camera: "Cámara",
		vms: "VMS",
		sensor: "Sensor",
		scale: "Báscula",
		temperature: "Temperatura",
	};

	return (
		<Badge variant={status === "online" ? "default" : "secondary"}>
			{labelByKind[kind]} {status === "online" ? "online" : "lista"}
		</Badge>
	);
}

function RiskBadge({ risk }: { risk: Risk }) {
	if (risk === "ok") {
		return (
			<Badge
				variant="outline"
				className="gap-1 border-emerald-300 text-emerald-700"
			>
				<CheckCircle2Icon className="h-3 w-3" />
				OK
			</Badge>
		);
	}
	if (risk === "critical") {
		return <Badge variant="destructive">Crítico</Badge>;
	}
	if (risk === "high") {
		return (
			<Badge className="bg-orange-500 text-white hover:bg-orange-600">
				Alto
			</Badge>
		);
	}
	return <Badge variant="secondary">Medio</Badge>;
}
