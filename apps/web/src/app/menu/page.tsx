"use client";

import { Button } from "@finopenpos/ui/components/button";
import { Input } from "@finopenpos/ui/components/input";
import {
	BeerIcon,
	GlassWaterIcon,
	MartiniIcon,
	MinusIcon,
	PlusIcon,
	SearchIcon,
	UtensilsCrossedIcon,
	WineIcon,
	XIcon,
	type LucideIcon,
} from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const display = Playfair_Display({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
});

type Category = "cocteles" | "cervezas" | "botellas" | "snacks" | "sin-alcohol";

type MenuItem = {
	id: number;
	name: string;
	description: string;
	price: number;
	category: Category;
	popular?: boolean;
};

const sections: { id: Category; label: string; note?: string }[] = [
	{ id: "cocteles", label: "Coctelería", note: "De autor y clásicos" },
	{ id: "cervezas", label: "Cervezas" },
	{ id: "botellas", label: "Botellas", note: "Servicio con mezcladores" },
	{ id: "snacks", label: "Para picar" },
	{ id: "sin-alcohol", label: "Sin alcohol" },
];

const categoryIcons: Record<Category, LucideIcon> = {
	cocteles: MartiniIcon,
	cervezas: BeerIcon,
	botellas: WineIcon,
	snacks: UtensilsCrossedIcon,
	"sin-alcohol": GlassWaterIcon,
};

const menuItems: MenuItem[] = [
	{
		id: 1,
		name: "Mojito",
		description: "Ron blanco, hierbabuena, limón fresco y agua mineral.",
		price: 160,
		category: "cocteles",
		popular: true,
	},
	{
		id: 2,
		name: "Margarita",
		description: "Tequila, licor de naranja, limón y escarchado de sal.",
		price: 170,
		category: "cocteles",
		popular: true,
	},
	{
		id: 3,
		name: "Carajillo",
		description: "Licor 43 y espresso recién preparado.",
		price: 190,
		category: "cocteles",
	},
	{
		id: 4,
		name: "Gin Tonic",
		description: "Ginebra premium, agua tónica y cítricos.",
		price: 190,
		category: "cocteles",
	},
	{
		id: 5,
		name: "Corona Extra",
		description: "Botella de 355 ml, servida bien fría.",
		price: 85,
		category: "cervezas",
		popular: true,
	},
	{
		id: 6,
		name: "Modelo Especial",
		description: "Cerveza tipo pilsner, botella de 355 ml.",
		price: 90,
		category: "cervezas",
	},
	{
		id: 7,
		name: "Heineken",
		description: "Cerveza lager, botella de 355 ml.",
		price: 100,
		category: "cervezas",
	},
	{
		id: 8,
		name: "Don Julio 70",
		description: "Botella de 700 ml con hielo, cítricos y seis mezcladores.",
		price: 3200,
		category: "botellas",
		popular: true,
	},
	{
		id: 9,
		name: "Buchanan's 12",
		description: "Botella de 750 ml con hielo, agua mineral y refrescos.",
		price: 2800,
		category: "botellas",
	},
	{
		id: 10,
		name: "Grey Goose",
		description: "Vodka de 750 ml con servicio completo de mezcladores.",
		price: 2700,
		category: "botellas",
	},
	{
		id: 11,
		name: "Alitas BBQ",
		description: "Diez alitas con salsa BBQ, apio y aderezo ranch.",
		price: 190,
		category: "snacks",
		popular: true,
	},
	{
		id: 12,
		name: "Nachos con Queso",
		description: "Totopos, queso, jalapeños y pico de gallo.",
		price: 140,
		category: "snacks",
	},
	{
		id: 13,
		name: "Mini Hamburguesas",
		description: "Tres mini hamburguesas acompañadas con papas.",
		price: 210,
		category: "snacks",
	},
	{
		id: 14,
		name: "Agua Mineral",
		description: "Botella de 355 ml.",
		price: 60,
		category: "sin-alcohol",
	},
	{
		id: 15,
		name: "Red Bull",
		description: "Bebida energética de 250 ml.",
		price: 90,
		category: "sin-alcohol",
	},
	{
		id: 16,
		name: "Limonada Mineral",
		description: "Limón natural, jarabe de la casa y agua mineral.",
		price: 85,
		category: "sin-alcohol",
	},
];

const money = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	maximumFractionDigits: 0,
});

export default function DigitalMenuPage() {
	const [search, setSearch] = useState("");
	const [cartOpen, setCartOpen] = useState(false);
	const [table, setTable] = useState("");
	const [cart, setCart] = useState<Record<number, number>>({});

	const groups = useMemo(() => {
		const query = search.trim().toLowerCase();
		return sections
			.map((section) => ({
				...section,
				items: menuItems.filter(
					(item) =>
						item.category === section.id &&
						(!query ||
							item.name.toLowerCase().includes(query) ||
							item.description.toLowerCase().includes(query)),
				),
			}))
			.filter((section) => section.items.length > 0);
	}, [search]);

	const cartItems = menuItems
		.filter((item) => cart[item.id])
		.map((item) => ({ ...item, quantity: cart[item.id] }));
	const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
	const total = cartItems.reduce(
		(sum, item) => sum + item.price * item.quantity,
		0,
	);

	const changeQuantity = (id: number, delta: number) => {
		setCart((current) => {
			const next = Math.max(0, (current[id] ?? 0) + delta);
			if (next === 0) {
				const copy = { ...current };
				delete copy[id];
				return copy;
			}
			return { ...current, [id]: next };
		});
	};

	const sendDemoOrder = () => {
		if (!table.trim()) {
			toast.error("Escribe el número de tu mesa.");
			return;
		}
		if (itemCount === 0) return;
		toast.success(`Pedido demo enviado desde ${table.trim()}`);
		setCart({});
		setTable("");
		setCartOpen(false);
	};

	return (
		<div className="min-h-screen bg-[#0b0a08] text-[#f4ecd8]">
			{/* Cover */}
			<header className="relative border-[#caa45e]/20 border-b px-4 py-14 text-center sm:py-20">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,164,94,0.12),transparent_55%)]" />
				<div className="relative mx-auto max-w-2xl">
					<p className="text-[11px] text-[#caa45e] uppercase tracking-[0.35em]">
						Antro POS
					</p>
					<h1
						className={`${display.className} mt-4 text-5xl sm:text-6xl`}
					>
						Carta Nocturna
					</h1>
					<div className="mx-auto mt-6 flex items-center justify-center gap-3 text-[#caa45e]/50">
						<span className="h-px w-12 bg-[#caa45e]/40" />
						<MartiniIcon className="h-4 w-4" />
						<span className="h-px w-12 bg-[#caa45e]/40" />
					</div>
					<p className="mt-6 text-sm text-[#f4ecd8]/55 leading-relaxed">
						Coctelería de autor, botellas y algo para picar. Precios
						expresados en pesos mexicanos.
					</p>
				</div>
			</header>

			{/* Index + search */}
			<div className="sticky top-0 z-20 border-[#caa45e]/15 border-b bg-[#0b0a08]/95 backdrop-blur-xl">
				<div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
					<div className="relative">
						<SearchIcon className="absolute top-1/2 left-1 h-4 w-4 -translate-y-1/2 text-[#f4ecd8]/35" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Buscar en la carta..."
							className="rounded-none border-0 border-[#caa45e]/25 border-b bg-transparent pl-7 text-[#f4ecd8] placeholder:text-[#f4ecd8]/35 focus-visible:ring-0"
						/>
					</div>
					<nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.2em]">
						{sections.map((section, index) => (
							<a
								key={section.id}
								href={`#${section.id}`}
								className="text-[#f4ecd8]/55 transition hover:text-[#caa45e]"
							>
								{index > 0 && (
									<span className="mr-5 text-[#caa45e]/30">·</span>
								)}
								{section.label}
							</a>
						))}
					</nav>
				</div>
			</div>

			{/* Sections */}
			<main className="mx-auto max-w-2xl px-4 py-12 sm:px-0">
				{groups.map((section) => {
					const Icon = categoryIcons[section.id];
					return (
						<section
							key={section.id}
							id={section.id}
							className="mb-14 scroll-mt-32"
						>
							<div className="mb-7 flex items-center gap-3">
								<Icon className="h-5 w-5 text-[#caa45e]" />
								<h2 className={`${display.className} text-2xl`}>
									{section.label}
								</h2>
								{section.note && (
									<span className="text-[#f4ecd8]/40 text-xs italic">
										{section.note}
									</span>
								)}
								<span className="ml-auto h-px flex-1 bg-[#caa45e]/15" />
							</div>

							<ul className="space-y-7">
								{section.items.map((item) => (
									<li key={item.id}>
										<div className="flex items-baseline gap-3">
											<h3 className="text-lg">
												{item.name}
												{item.popular && (
													<span className="ml-2 text-[10px] text-[#caa45e]/80 uppercase tracking-[0.2em]">
														Favorito
													</span>
												)}
											</h3>
											<span className="flex-1 translate-y-[-3px] border-[#caa45e]/20 border-b border-dotted" />
											<span
												className={`${display.className} text-lg text-[#caa45e]`}
											>
												{money.format(item.price)}
											</span>
										</div>
										<div className="mt-1.5 flex items-end justify-between gap-4">
											<p className="text-[#f4ecd8]/45 text-sm italic">
												{item.description}
											</p>
											{cart[item.id] ? (
												<div className="flex shrink-0 items-center gap-3 text-sm">
													<button
														type="button"
														onClick={() => changeQuantity(item.id, -1)}
														className="flex h-7 w-7 items-center justify-center rounded-full border border-[#caa45e]/30 text-[#caa45e] hover:bg-[#caa45e]/10"
													>
														<MinusIcon className="h-3.5 w-3.5" />
													</button>
													<span className="w-4 text-center">
														{cart[item.id]}
													</span>
													<button
														type="button"
														onClick={() => changeQuantity(item.id, 1)}
														className="flex h-7 w-7 items-center justify-center rounded-full bg-[#caa45e] text-[#0b0a08] hover:bg-[#dcb978]"
													>
														<PlusIcon className="h-3.5 w-3.5" />
													</button>
												</div>
											) : (
												<button
													type="button"
													onClick={() => changeQuantity(item.id, 1)}
													className="shrink-0 text-[#caa45e] text-xs uppercase tracking-[0.2em] hover:text-[#dcb978]"
												>
													+ Agregar
												</button>
											)}
										</div>
									</li>
								))}
							</ul>
						</section>
					);
				})}

				{groups.length === 0 && (
					<p className="py-20 text-center text-[#f4ecd8]/40 italic">
						No encontramos nada con esa búsqueda.
					</p>
				)}
			</main>

			<footer className="border-[#caa45e]/15 border-t px-4 py-8 text-center text-[#f4ecd8]/35 text-xs">
				Menú de demostración · El consumo de alcohol es responsabilidad de
				cada persona.
			</footer>

			{/* Floating cart trigger */}
			{itemCount > 0 && !cartOpen && (
				<button
					type="button"
					onClick={() => setCartOpen(true)}
					className="fixed right-4 bottom-4 left-4 z-30 flex items-center justify-between rounded-full border border-[#caa45e]/40 bg-[#0b0a08] px-6 py-3.5 text-[#f4ecd8] shadow-2xl shadow-black/60 sm:right-6 sm:left-auto sm:min-w-72"
				>
					<span className="text-sm uppercase tracking-[0.15em]">
						Tu pedido · {itemCount}
					</span>
					<span className={`${display.className} text-[#caa45e]`}>
						{money.format(total)}
					</span>
				</button>
			)}

			{/* Cart drawer */}
			{cartOpen && (
				<div className="fixed inset-0 z-50">
					<button
						type="button"
						aria-label="Cerrar pedido"
						onClick={() => setCartOpen(false)}
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
					/>
					<aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-[#caa45e]/20 border-l bg-[#0b0a08] text-[#f4ecd8] shadow-2xl">
						<div className="flex items-center justify-between border-[#caa45e]/15 border-b p-5">
							<div>
								<h2 className={`${display.className} text-xl`}>
									Tu pedido
								</h2>
								<p className="text-[#f4ecd8]/40 text-xs italic">
									Demostración sin cobro real
								</p>
							</div>
							<Button
								size="icon"
								variant="ghost"
								onClick={() => setCartOpen(false)}
								className="text-[#f4ecd8] hover:bg-[#caa45e]/10 hover:text-[#f4ecd8]"
							>
								<XIcon className="h-5 w-5" />
							</Button>
						</div>
						<div className="flex-1 space-y-5 overflow-y-auto p-5">
							{cartItems.length === 0 ? (
								<p className="pt-16 text-center text-[#f4ecd8]/35 italic">
									Tu pedido está vacío.
								</p>
							) : (
								cartItems.map((item) => (
									<div key={item.id}>
										<div className="flex items-baseline gap-3">
											<p>{item.name}</p>
											<span className="flex-1 translate-y-[-3px] border-[#caa45e]/20 border-b border-dotted" />
											<span className="text-[#caa45e]">
												{money.format(item.price * item.quantity)}
											</span>
										</div>
										<div className="mt-1.5 flex justify-end gap-3 text-sm">
											<button
												type="button"
												onClick={() => changeQuantity(item.id, -1)}
												className="flex h-7 w-7 items-center justify-center rounded-full border border-[#caa45e]/30 text-[#caa45e] hover:bg-[#caa45e]/10"
											>
												<MinusIcon className="h-3.5 w-3.5" />
											</button>
											<span className="w-4 text-center">
												{item.quantity}
											</span>
											<button
												type="button"
												onClick={() => changeQuantity(item.id, 1)}
												className="flex h-7 w-7 items-center justify-center rounded-full bg-[#caa45e] text-[#0b0a08] hover:bg-[#dcb978]"
											>
												<PlusIcon className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
								))
							)}
						</div>
						<div className="space-y-4 border-[#caa45e]/15 border-t p-5">
							<div className="space-y-1.5">
								<label
									htmlFor="demo-table"
									className="text-[#f4ecd8]/55 text-xs uppercase tracking-[0.2em]"
								>
									Tu mesa
								</label>
								<Input
									id="demo-table"
									value={table}
									onChange={(event) => setTable(event.target.value)}
									placeholder="Ej. Mesa 4"
									className="rounded-none border-0 border-[#caa45e]/25 border-b bg-transparent text-[#f4ecd8] focus-visible:ring-0"
								/>
							</div>
							<div className="flex items-baseline justify-between">
								<span className="text-[#f4ecd8]/55 text-sm">Total</span>
								<strong className={`${display.className} text-xl text-[#caa45e]`}>
									{money.format(total)}
								</strong>
							</div>
							<Button
								onClick={sendDemoOrder}
								disabled={itemCount === 0}
								className="w-full rounded-full bg-[#caa45e] text-[#0b0a08] hover:bg-[#dcb978]"
								size="lg"
							>
								Enviar pedido demo
							</Button>
						</div>
					</aside>
				</div>
			)}
		</div>
	);
}
