"use client";

import {
	BeerIcon,
	GlassWaterIcon,
	MartiniIcon,
	MoonIcon,
	SparklesIcon,
	SunIcon,
	UtensilsCrossedIcon,
	WineIcon,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { productPhotoUrl } from "@/lib/product-photos";

const displayClass = "font-serif";

type Theme = "dark" | "light";
type Category =
	| "promos"
	| "botellas"
	| "cocteles"
	| "cervezas"
	| "alimentos"
	| "sin-alcohol";

type MenuItem = {
	id: number;
	name: string;
	description: string;
	price: number;
	cost: number;
	category: Category;
	image: string;
	inventory: number;
	minInventory: number;
	demand: number;
	wasteRisk: number;
	expiresInDays?: number;
	manualBoost?: number;
	promotable?: boolean;
	pairsWith?: string[];
};

type RankedItem = MenuItem & {
	score: number;
	customerTag: string;
	layout: "hero" | "feature" | "compact";
};

type MenuSection = {
	id: Category;
	group: string;
	label: string;
	note: string;
	icon: LucideIcon;
};

const money = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	maximumFractionDigits: 0,
});

const themeStyles = {
	dark: {
		page: "bg-[#050505] text-white",
		hero: "bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.10),transparent_26%),linear-gradient(135deg,#111_0%,#050505_55%,#171717_100%)]",
		card: "border-white/10 bg-[#111] shadow-black/30",
		cardSoft: "border-white/10 bg-white/[0.045]",
		border: "border-white/10",
		title: "text-white",
		muted: "text-white/62",
		soft: "text-white/42",
		imagePanel: "bg-gradient-to-br from-[#202020] via-[#111] to-black",
		imagePanelLight: "bg-white",
		accent: "text-[#d6b15f]",
	badge: "bg-[#d6b15f] text-black",
	subtleBadge: "bg-white/10 text-white",
	},
	light: {
		page: "bg-[#f6f5f2] text-[#111]",
		hero: "bg-[radial-gradient(circle_at_20%_10%,rgba(0,0,0,0.07),transparent_26%),linear-gradient(135deg,#fff_0%,#f6f5f2_55%,#e9e6df_100%)]",
		card: "border-black/10 bg-white shadow-black/5",
		cardSoft: "border-black/10 bg-white/75",
		border: "border-black/10",
		title: "text-[#111]",
		muted: "text-black/62",
		soft: "text-black/42",
		imagePanel: "bg-gradient-to-br from-white via-[#f1f1ef] to-[#dedbd4]",
		imagePanelLight: "bg-white",
		accent: "text-[#8a651f]",
	badge: "bg-[#111] text-white",
	subtleBadge: "bg-black/6 text-black",
	},
} as const;

const sections: MenuSection[] = [
	{
		id: "promos",
		group: "especiales",
		label: "Especiales de la noche",
		note: "Combos y experiencias para compartir en mesa.",
		icon: SparklesIcon,
	},
	{
		id: "botellas",
		group: "bebidas",
		label: "Botellas VIP",
		note: "Servicio con hielo, cítricos y mezcladores.",
		icon: WineIcon,
	},
	{
		id: "cocteles",
		group: "bebidas",
		label: "Coctelería",
		note: "Clásicos, tragos frescos y bebidas de noche.",
		icon: MartiniIcon,
	},
	{
		id: "cervezas",
		group: "bebidas",
		label: "Cervezas y cubetas",
		note: "Botellas individuales y paquetes para mesa.",
		icon: BeerIcon,
	},
	{
		id: "alimentos",
		group: "comida",
		label: "Alimentos para compartir",
		note: "Botanas, platos fuertes y antojos de madrugada.",
		icon: UtensilsCrossedIcon,
	},
	{
		id: "sin-alcohol",
		group: "bebidas",
		label: "Sin alcohol y mezcladores",
		note: "Aguas, refrescos, energéticas y mocktails.",
		icon: GlassWaterIcon,
	},
];

const photo = (name: string, category: Category) => productPhotoUrl(name, category);

const items: MenuItem[] = [
	{ id: 1, name: "Combo Cumpleañero", description: "Vodka premium, mezcladores, bengala, mesa decorada y accesos.", price: 3990, cost: 1680, category: "promos", image: photo("Combo Cumpleañero", "promos"), inventory: 18, minInventory: 4, demand: 78, wasteRisk: 18, manualBoost: 8, promotable: true, pairsWith: ["Red Bull", "Nachos Supreme"] },
	{ id: 2, name: "Pack Precopeo", description: "Cubeta de 10 cervezas, nachos y papas para compartir.", price: 990, cost: 420, category: "promos", image: photo("Pack Precopeo", "promos"), inventory: 42, minInventory: 12, demand: 64, wasteRisk: 42, manualBoost: 12, promotable: true, pairsWith: ["Papas Gajo con Queso"] },
	{ id: 3, name: "Mesa VIP Black", description: "Don Julio 70, Buchanan's 12 y mezcladores de servicio.", price: 5790, cost: 2850, category: "promos", image: photo("Mesa VIP Black", "promos"), inventory: 8, minInventory: 2, demand: 71, wasteRisk: 10, manualBoost: 6, promotable: true },
	{ id: 4, name: "Don Julio 70", description: "Botella 700 ml con hielo, cítricos, sal y seis mezcladores.", price: 3200, cost: 1450, category: "botellas", image: photo("Don Julio 70", "botellas"), inventory: 7, minInventory: 3, demand: 82, wasteRisk: 6, manualBoost: 3 },
	{ id: 5, name: "Buchanan's 12", description: "Botella 750 ml con agua mineral, refrescos y servicio VIP.", price: 2800, cost: 1280, category: "botellas", image: photo("Buchanan's 12", "botellas"), inventory: 11, minInventory: 4, demand: 68, wasteRisk: 8 },
	{ id: 6, name: "Grey Goose", description: "Vodka premium 750 ml con mezcladores y fruta de temporada.", price: 2700, cost: 1220, category: "botellas", image: photo("Grey Goose", "botellas"), inventory: 15, minInventory: 3, demand: 48, wasteRisk: 24, promotable: true },
	{ id: 7, name: "Moët Brut", description: "Champagne frío para celebración, con bengala de cortesía.", price: 3900, cost: 2100, category: "botellas", image: photo("Moët Brut", "botellas"), inventory: 5, minInventory: 2, demand: 41, wasteRisk: 5 },
	{ id: 8, name: "Azulito", description: "Vodka, energética azul, limón y escarchado.", price: 180, cost: 54, category: "cocteles", image: photo("Azulito", "cocteles"), inventory: 76, minInventory: 20, demand: 86, wasteRisk: 36, manualBoost: 9, promotable: true, pairsWith: ["Papas Gajo con Queso"] },
	{ id: 9, name: "Margarita", description: "Tequila, licor de naranja, limón fresco y sal.", price: 170, cost: 58, category: "cocteles", image: photo("Margarita", "cocteles"), inventory: 38, minInventory: 14, demand: 72, wasteRisk: 22, promotable: true },
	{ id: 10, name: "Carajillo", description: "Licor 43 con espresso recién preparado.", price: 190, cost: 62, category: "cocteles", image: photo("Carajillo", "cocteles"), inventory: 32, minInventory: 10, demand: 66, wasteRisk: 14 },
	{ id: 11, name: "Gin Tonic", description: "Ginebra, agua tónica, cítricos y botánicos.", price: 190, cost: 68, category: "cocteles", image: photo("Gin Tonic", "cocteles"), inventory: 18, minInventory: 8, demand: 49, wasteRisk: 18 },
	{ id: 12, name: "Cubeta Nacional", description: "10 cervezas nacionales con hielo al centro de mesa.", price: 790, cost: 335, category: "cervezas", image: photo("Cubeta Nacional", "cervezas"), inventory: 58, minInventory: 20, demand: 75, wasteRisk: 48, manualBoost: 7, promotable: true },
	{ id: 13, name: "Corona Extra", description: "Botella 355 ml servida bien fría.", price: 85, cost: 38, category: "cervezas", image: photo("Corona Extra", "cervezas"), inventory: 95, minInventory: 35, demand: 69, wasteRisk: 34 },
	{ id: 14, name: "Heineken", description: "Cerveza lager botella 355 ml.", price: 100, cost: 46, category: "cervezas", image: photo("Heineken", "cervezas"), inventory: 44, minInventory: 18, demand: 52, wasteRisk: 20 },
	{ id: 15, name: "Alitas BBQ", description: "10 piezas con salsa BBQ, apio, zanahoria y ranch.", price: 190, cost: 76, category: "alimentos", image: photo("Alitas BBQ", "alimentos"), inventory: 23, minInventory: 8, demand: 62, wasteRisk: 82, expiresInDays: 2, manualBoost: 10, promotable: true, pairsWith: ["Cubeta Nacional"] },
	{ id: 16, name: "Nachos Supreme", description: "Totopos, queso, jalapeños, carne, pico de gallo y crema.", price: 180, cost: 62, category: "alimentos", image: photo("Nachos Supreme", "alimentos"), inventory: 31, minInventory: 10, demand: 58, wasteRisk: 70, expiresInDays: 3, promotable: true, pairsWith: ["Pack Precopeo"] },
	{ id: 17, name: "Tacos de Arrachera", description: "Orden de 4 tacos con guacamole, salsa tatemada y limón.", price: 260, cost: 118, category: "alimentos", image: photo("Tacos de Arrachera", "alimentos"), inventory: 16, minInventory: 6, demand: 47, wasteRisk: 74, expiresInDays: 2, promotable: true },
	{ id: 18, name: "Mini Burgers", description: "Tres mini hamburguesas con papas gajo.", price: 230, cost: 92, category: "alimentos", image: photo("Mini Burgers", "alimentos"), inventory: 14, minInventory: 6, demand: 54, wasteRisk: 64, expiresInDays: 3 },
	{ id: 19, name: "Papas Gajo con Queso", description: "Papas gajo con queso fundido, tocino, jalapeños y crema.", price: 160, cost: 48, category: "alimentos", image: photo("Papas Gajo con Queso", "alimentos"), inventory: 39, minInventory: 14, demand: 44, wasteRisk: 58, promotable: true },
	{ id: 20, name: "Red Bull", description: "Bebida energética 250 ml.", price: 90, cost: 41, category: "sin-alcohol", image: photo("Red Bull", "sin-alcohol"), inventory: 92, minInventory: 24, demand: 73, wasteRisk: 28, manualBoost: 5, promotable: true },
	{ id: 21, name: "Agua Mineral", description: "Botella 355 ml.", price: 60, cost: 18, category: "sin-alcohol", image: photo("Agua Mineral", "sin-alcohol"), inventory: 120, minInventory: 35, demand: 71, wasteRisk: 12 },
	{ id: 22, name: "Mocktail Frutos Rojos", description: "Frutos rojos, limón, hierbabuena y soda.", price: 120, cost: 38, category: "sin-alcohol", image: photo("Mocktail Frutos Rojos", "sin-alcohol"), inventory: 22, minInventory: 8, demand: 38, wasteRisk: 62, expiresInDays: 2, promotable: true },
];

const containImageCategories: Partial<Record<Category, boolean>> = {
	botellas: true,
	cervezas: true,
	"sin-alcohol": true,
};

function isDisplayable(item: MenuItem) {
	return item.inventory > Math.max(1, item.minInventory * 0.8);
}

function canBeFeatured(item: MenuItem) {
	return item.inventory > item.minInventory * 1.45;
}

function rankItem(item: MenuItem): RankedItem {
	const marginRate = Math.round(((item.price - item.cost) / item.price) * 100);
	const stockPressure = Math.max(
		0,
		Math.min(
			100,
			((item.inventory - item.minInventory) / Math.max(item.minInventory, 1)) *
				24,
		),
	);
	const lowInventoryPenalty =
		item.inventory <= item.minInventory
			? 85
			: item.inventory <= item.minInventory * 1.5
				? 42
				: 0;
	const expiryBoost = item.expiresInDays
		? Math.max(0, 34 - item.expiresInDays * 8)
		: 0;
	const score = Math.max(0, Math.round(
		marginRate * 0.34 +
			item.demand * 0.22 +
			item.wasteRisk * 0.2 +
			stockPressure * 0.14 +
			expiryBoost +
			(item.manualBoost ?? 0) -
			lowInventoryPenalty,
	));
	const customerTag = getCustomerTag(item, score);
	const layout = score >= 86 ? "hero" : score >= 68 ? "feature" : "compact";
	return { ...item, score, customerTag, layout };
}

function getCustomerTag(item: MenuItem, score: number) {
	if (item.category === "promos") return "Especial";
	if (item.category === "botellas" && score >= 68) return "VIP";
	if (item.expiresInDays && item.expiresInDays <= 2) return "Por tiempo limitado";
	if (item.demand >= 75) return "Favorito";
	if (item.promotable) return "Recomendado";
	return "Clásico";
}

function promoTitle(item: RankedItem) {
	if (item.category === "promos") return "Paquete de la noche";
	if (item.pairsWith?.length) return `Ideal con ${item.pairsWith[0]}`;
	if (item.category === "alimentos") return "Perfecto para compartir";
	if (item.category === "botellas") return "Servicio especial";
	return "Recomendado de la casa";
}

function sectionLabel(category: Category) {
	const section = sections.find((item) => item.id === category);
	return section?.label ?? "Carta";
}

function imageTreatment(category: Category) {
	return containImageCategories[category] ? "contain" : "cover";
}

function ProductPhoto({
	item,
	theme,
	size,
}: {
	item: MenuItem;
	theme: Theme;
	size: "hero" | "card" | "thumb";
}) {
	const t = themeStyles[theme];
	const treatment = imageTreatment(item.category);
	const sizeClass =
		size === "hero"
			? "h-[360px]"
			: size === "card"
				? "h-64"
				: "h-20 w-20 shrink-0";
	const radius = size === "thumb" ? "rounded-2xl" : "rounded-[1.75rem]";

	if (treatment === "contain") {
		return (
			<div className={`${sizeClass} ${radius} ${t.imagePanel} overflow-hidden p-5`}>
				<img
					src={item.image}
					alt={item.name}
					className="h-full w-full object-contain"
					loading={size === "hero" ? "eager" : "lazy"}
					referrerPolicy="no-referrer"
				/>
			</div>
		);
	}

	return (
		<div className={`${sizeClass} ${radius} overflow-hidden`}>
			<img
				src={item.image}
				alt={item.name}
				className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
				loading={size === "hero" ? "eager" : "lazy"}
				referrerPolicy="no-referrer"
			/>
		</div>
	);
}

export default function DigitalMenuPage() {
	const [theme, setTheme] = useState<Theme>("dark");
	const t = themeStyles[theme];

	const ranked = useMemo(
		() => items.filter(isDisplayable).map(rankItem).sort((a, b) => b.score - a.score),
		[],
	);
	const hero = ranked.find(canBeFeatured) ?? ranked[0];
	const highlights = ranked.filter((item) => item.id !== hero?.id && canBeFeatured(item)).slice(0, 4);
	const promoted = ranked.filter((item) => item.promotable && canBeFeatured(item)).slice(0, 6);
	const orderedSections = sections
		.map((section) => {
			const sectionItems = ranked.filter((item) => item.category === section.id);
			const sectionWeight =
				sectionItems.reduce((sum, item) => sum + item.score, 0) /
				Math.max(sectionItems.length, 1);
			return { ...section, items: sectionItems, sectionWeight };
		})
		.filter((section) => section.items.length > 0)
		.sort((a, b) => b.sectionWeight - a.sectionWeight);

	return (
		<div className={`min-h-screen ${t.page}`}>
			<header className={`relative overflow-hidden border-b ${t.border}`}>
				<div className={`absolute inset-0 ${t.hero}`} />
				<div className="relative mx-auto max-w-7xl px-4 py-10 lg:py-16">
					<div className="mb-10 flex flex-wrap items-center justify-between gap-4">
						<div>
							<p className={`text-sm ${t.soft}`}>Blinder · carta de noche</p>
						</div>
						<ThemeSwitch theme={theme} setTheme={setTheme} />
					</div>

					<div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
						<div>
							<h1
								className={`${displayClass} ${t.title} max-w-3xl text-5xl leading-none sm:text-7xl`}
							>
								Carta de noche
							</h1>
							<p className={`mt-5 max-w-xl text-lg ${t.muted}`}>
								Botellas, cocteles, cervezas, alimentos para compartir y especiales
								de temporada.
							</p>
							<div className="mt-8 grid gap-3 sm:grid-cols-3">
								<MiniCategory title="Bebidas" text="Botellas, cocteles y cervezas." theme={theme} />
								<MiniCategory title="Comida" text="Botanas y platos para mesa." theme={theme} />
								<MiniCategory title="Especiales" text="Paquetes y promociones." theme={theme} />
							</div>
						</div>

						<HeroCard item={hero} theme={theme} />
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-7xl space-y-14 px-4 py-10">
				<section>
					<SectionHeading
						kicker="de la casa"
						title="Sugerencias de la casa"
						note="Bebidas y alimentos seleccionados para la noche."
						theme={theme}
					/>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{highlights.map((item) => (
							<HighlightCard key={item.id} item={item} theme={theme} />
						))}
					</div>
				</section>

				<section>
					<SectionHeading
						kicker="especiales"
						title="Especiales y paquetes"
						note="Opciones para mesa, grupos y celebraciones."
						theme={theme}
					/>
					<div className="grid gap-4 lg:grid-cols-3">
						{promoted.map((item) => (
							<PromoCard key={item.id} item={item} theme={theme} />
						))}
					</div>
				</section>

				{orderedSections.map((section) => {
					const Icon = section.icon;
					const featured = section.items.filter((item) => item.layout !== "compact").slice(0, 2);
					const compact = section.items.filter((item) => !featured.includes(item));
					return (
						<section key={section.id}>
							<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<div className="flex items-center gap-2 text-[#a8843d]">
										<Icon className="h-5 w-5" />
										<p className="text-xs uppercase tracking-[0.28em]">
											{section.group}
										</p>
									</div>
									<h2
										className={`${displayClass} ${t.title} mt-1 text-4xl`}
									>
										{section.label}
									</h2>
									<p className={`mt-1 max-w-2xl ${t.muted}`}>{section.note}</p>
								</div>
							</div>

							{featured.length > 0 && (
								<div className="mb-5 grid gap-5 lg:grid-cols-2">
									{featured.map((item) => (
										<FeatureCard key={item.id} item={item} theme={theme} />
									))}
								</div>
							)}

							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
								{compact.map((item) => (
									<CompactCard key={item.id} item={item} theme={theme} />
								))}
							</div>
						</section>
					);
				})}
			</main>

			<footer className={`border-t px-4 py-8 text-center text-xs ${t.border} ${t.soft}`}>
				Menú demo · precios en MXN · el consumo de alcohol es responsabilidad de cada persona.
			</footer>
		</div>
	);
}

function ThemeSwitch({
	theme,
	setTheme,
}: {
	theme: Theme;
	setTheme: (theme: Theme) => void;
}) {
	return (
		<div className="flex rounded-full border border-current/15 p-1">
			<button
				type="button"
				onClick={() => setTheme("dark")}
				className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition ${
					theme === "dark" ? "bg-white text-black" : "text-current/60"
				}`}
			>
				<MoonIcon className="h-3.5 w-3.5" />
				Oscuro
			</button>
			<button
				type="button"
				onClick={() => setTheme("light")}
				className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition ${
					theme === "light" ? "bg-black text-white" : "text-current/60"
				}`}
			>
				<SunIcon className="h-3.5 w-3.5" />
				Claro
			</button>
		</div>
	);
}

function MiniCategory({
	title,
	text,
	theme,
}: {
	title: string;
	text: string;
	theme: Theme;
}) {
	const t = themeStyles[theme];
	return (
		<div className={`rounded-3xl border p-4 ${t.cardSoft}`}>
			<p className={`${displayClass} ${t.title} text-xl`}>{title}</p>
			<p className={`mt-1 text-sm ${t.muted}`}>{text}</p>
		</div>
	);
}

function SectionHeading({
	kicker,
	title,
	note,
	theme,
}: {
	kicker: string;
	title: string;
	note: string;
	theme: Theme;
}) {
	const t = themeStyles[theme];
	return (
		<div className="mb-6">
			<p className="text-[#a8843d] text-xs uppercase tracking-[0.28em]">{kicker}</p>
			<h2 className={`${displayClass} ${t.title} mt-1 text-4xl`}>{title}</h2>
			<p className={`mt-2 max-w-3xl ${t.muted}`}>{note}</p>
		</div>
	);
}

function HeroCard({ item, theme }: { item: RankedItem; theme: Theme }) {
	const t = themeStyles[theme];
	return (
		<article className={`group grid overflow-hidden rounded-[2rem] border shadow-2xl lg:grid-cols-[1.05fr_0.95fr] ${t.card}`}>
			<ProductPhoto item={item} theme={theme} size="hero" />
			<div className="flex flex-col justify-center p-6 lg:p-8">
				<h2 className={`${displayClass} ${t.title} text-4xl`}>{item.name}</h2>
				<p className={`mt-3 ${t.muted}`}>{item.description}</p>
				<div className="mt-8 flex items-end justify-between gap-4">
					<p className={`text-sm ${t.soft}`}>Especial de la noche</p>
					<p className="font-bold text-[#a8843d] text-3xl">{money.format(item.price)}</p>
				</div>
			</div>
		</article>
	);
}

function HighlightCard({ item, theme }: { item: RankedItem; theme: Theme }) {
	const t = themeStyles[theme];
	return (
		<article className={`group overflow-hidden rounded-[1.75rem] border shadow-xl ${t.card}`}>
			<ProductPhoto item={item} theme={theme} size="card" />
			<div className="p-5">
				<h3 className={`font-bold text-xl ${t.title}`}>{item.name}</h3>
				<p className={`mt-1 line-clamp-2 text-sm ${t.muted}`}>{item.description}</p>
				<div className="mt-5 flex items-end justify-between">
					<p className={`text-xs ${t.soft}`}>{sectionLabel(item.category)}</p>
					<p className="font-bold text-[#a8843d] text-xl">{money.format(item.price)}</p>
				</div>
			</div>
		</article>
	);
}

function PromoCard({ item, theme }: { item: RankedItem; theme: Theme }) {
	const t = themeStyles[theme];
	return (
		<article className={`rounded-3xl border p-5 ${t.cardSoft}`}>
			<div className="mb-4 flex items-start justify-between gap-4">
				<div>
					<h3 className={`font-bold text-xl ${t.title}`}>{item.name}</h3>
					<p className={`mt-1 text-sm ${t.muted}`}>
						{item.pairsWith?.length
							? `Sugerido con ${item.pairsWith.join(", ")}.`
							: item.description}
					</p>
				</div>
				<p className="font-bold text-[#a8843d]">{money.format(item.price)}</p>
			</div>
		</article>
	);
}

function FeatureCard({ item, theme }: { item: RankedItem; theme: Theme }) {
	const t = themeStyles[theme];
	return (
		<article className={`group overflow-hidden rounded-[1.75rem] border shadow-xl ${t.card}`}>
			<ProductPhoto item={item} theme={theme} size="card" />
			<div className="p-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className={`font-bold text-2xl ${t.title}`}>{item.name}</h3>
						<p className={`mt-1 text-sm ${t.muted}`}>{item.description}</p>
					</div>
					<p className="shrink-0 font-bold text-[#a8843d] text-xl">
						{money.format(item.price)}
					</p>
				</div>
			</div>
		</article>
	);
}

function CompactCard({ item, theme }: { item: RankedItem; theme: Theme }) {
	const t = themeStyles[theme];
	return (
		<article className={`flex gap-4 rounded-3xl border p-3 ${t.cardSoft}`}>
			<ProductPhoto item={item} theme={theme} size="thumb" />
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 className={`font-semibold ${t.title}`}>{item.name}</h3>
						<p className={`mt-1 line-clamp-2 text-sm ${t.muted}`}>{item.description}</p>
					</div>
					<p className="shrink-0 font-bold text-[#a8843d]">{money.format(item.price)}</p>
				</div>
			</div>
		</article>
	);
}
