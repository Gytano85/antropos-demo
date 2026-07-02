"use client";

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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Building2Icon,
	ImageIcon,
	PaletteIcon,
	ReceiptTextIcon,
	SaveIcon,
	SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { applyAdminTheme } from "@/components/admin-theme-applier";
import { ProductImage } from "@/components/product-image";
import { useTRPC } from "@/lib/trpc/client";

const tabs = [
	{ id: "general", label: "General", icon: Building2Icon },
	{ id: "appearance", label: "Apariencia", icon: PaletteIcon },
	{ id: "images", label: "Imágenes", icon: ImageIcon },
	{ id: "fiscal", label: "Fiscal", icon: ReceiptTextIcon },
] as const;

type TabId = (typeof tabs)[number]["id"];

const palettes = [
	{
		name: "Original blanco y negro",
		primary_color: "#111827",
		accent_color: "#f3f4f6",
		background_color: "#ffffff",
		card_color: "#ffffff",
		text_color: "#111827",
	},
	{
		name: "Noche premium",
		primary_color: "#f8fafc",
		accent_color: "#f59e0b",
		background_color: "#09090b",
		card_color: "#18181b",
		text_color: "#f8fafc",
	},
	{
		name: "Dorado sobrio",
		primary_color: "#d4af37",
		accent_color: "#facc15",
		background_color: "#111827",
		card_color: "#1f2937",
		text_color: "#f9fafb",
	},
	{
		name: "Azul ejecutivo",
		primary_color: "#1e3a8a",
		accent_color: "#0ea5e9",
		background_color: "#f8fafc",
		card_color: "#ffffff",
		text_color: "#0f172a",
	},
	{
		name: "Vino club",
		primary_color: "#be123c",
		accent_color: "#fb7185",
		background_color: "#111111",
		card_color: "#1c1917",
		text_color: "#fff7ed",
	},
];

function getContrastColor(hex: string) {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function SettingsPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const searchParams = useSearchParams();
	const selected = (searchParams.get("tab") || "general") as TabId;
	const active = tabs.some((tab) => tab.id === selected) ? selected : "general";
	const { data: settings, isLoading } = useQuery(
		trpc.appSettings.get.queryOptions(),
	);
	const { data: products = [] } = useQuery(trpc.products.list.queryOptions());

	const [form, setForm] = useState({
		company_title: "Antro POS",
		primary_color: "#111827",
		accent_color: "#f3f4f6",
		background_color: "#ffffff",
		card_color: "#ffffff",
		text_color: "#111827",
	});

	useEffect(() => {
		if (!settings) return;
		setForm({
			company_title: settings.company_title,
			primary_color: settings.primary_color,
			accent_color: settings.accent_color,
			background_color: settings.background_color,
			card_color: settings.card_color,
			text_color: settings.text_color,
		});
	}, [settings]);

	const updateMutation = useMutation(
		trpc.appSettings.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.appSettings.get.queryOptions());
				toast.success("Configuración guardada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const updateProductMutation = useMutation(
		trpc.products.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.products.list.queryOptions());
				toast.success("Imagen actualizada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const selectTab = (tab: TabId) => {
		router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
	};

	const updateField = (key: keyof typeof form, value: string) => {
		setForm((current) => {
			const next = { ...current, [key]: value };
			if (key !== "company_title" && /^#[0-9a-fA-F]{6}$/.test(value)) {
				applyAdminTheme(next);
			}
			return next;
		});
	};

	const applyPalette = (palette: (typeof palettes)[number]) => {
		setForm((current) => {
			const next = { ...current, ...palette };
			applyAdminTheme(next);
			return next;
		});
	};

	const save = () => updateMutation.mutate(form);

	const saveProductImage = (id: number, image_url: string) => {
		updateProductMutation.mutate({ id, image_url });
	};

	if (isLoading) {
		return <div className="text-muted-foreground">Cargando configuración...</div>;
	}

	return (
		<div className="mx-auto max-w-5xl space-y-4">
			<div>
				<div className="flex items-center gap-2">
					<SettingsIcon className="h-6 w-6 text-primary" />
					<h2 className="font-bold text-2xl">Configuración</h2>
				</div>
				<p className="text-muted-foreground text-sm">
					Configura identidad, colores y datos fiscales desde un solo lugar.
				</p>
			</div>

			<div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-4">
				{tabs.map(({ id, label, icon: Icon }) => (
					<Button
						key={id}
						type="button"
						variant={active === id ? "default" : "ghost"}
						className="justify-start gap-2"
						onClick={() => selectTab(id)}
					>
						<Icon className="h-4 w-4" />
						{label}
					</Button>
				))}
			</div>

			{active === "general" && (
				<Card>
					<CardHeader>
						<CardTitle>Identidad del negocio</CardTitle>
						<CardDescription>
							Este nombre aparece en la barra superior como logo escrito.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Nombre de la empresa</Label>
							<Input
								value={form.company_title}
								onChange={(event) =>
									updateField("company_title", event.target.value)
								}
								placeholder="Ej. La Santa, Imperio Club, Antro POS"
							/>
						</div>
						<Preview form={form} />
						<Button onClick={save} disabled={updateMutation.isPending}>
							<SaveIcon className="mr-2 h-4 w-4" />
							Guardar configuración
						</Button>
					</CardContent>
				</Card>
			)}

			{active === "appearance" && (
				<Card>
					<CardHeader>
						<CardTitle>Colores de la página</CardTitle>
						<CardDescription>
							Elige una paleta o ajusta cada color manualmente.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="grid gap-3 sm:grid-cols-4">
							{palettes.map((palette) => (
								<button
									key={palette.name}
									type="button"
									className="rounded-xl border bg-card p-3 text-left transition hover:border-primary"
									onClick={() => applyPalette(palette)}
								>
									<div className="mb-3 flex gap-1">
										{[
											palette.primary_color,
											palette.accent_color,
											palette.background_color,
										].map((color) => (
											<span
												key={color}
												className="h-6 w-6 rounded-full border"
												style={{ backgroundColor: color }}
											/>
										))}
									</div>
									<span className="font-medium text-sm">{palette.name}</span>
								</button>
							))}
						</div>

						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
							<ColorField
								label="Primario"
								value={form.primary_color}
								onChange={(value) => updateField("primary_color", value)}
							/>
							<ColorField
								label="Acento"
								value={form.accent_color}
								onChange={(value) => updateField("accent_color", value)}
							/>
							<ColorField
								label="Fondo"
								value={form.background_color}
								onChange={(value) => updateField("background_color", value)}
							/>
							<ColorField
								label="Tarjetas"
								value={form.card_color}
								onChange={(value) => updateField("card_color", value)}
							/>
							<ColorField
								label="Texto"
								value={form.text_color}
								onChange={(value) => updateField("text_color", value)}
							/>
						</div>

						<Preview form={form} />
						<Button onClick={save} disabled={updateMutation.isPending}>
							<SaveIcon className="mr-2 h-4 w-4" />
							Guardar colores
						</Button>
					</CardContent>
				</Card>
			)}

			{active === "images" && (
				<Card>
					<CardHeader>
						<CardTitle>Imágenes de productos</CardTitle>
						<CardDescription>
							Pega aquí una URL directa de imagen para cada producto. Sirve para
							corregir la carta, POS e inventario sin tocar código.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-sm">
							Usa links directos que terminen o respondan como imagen: JPG, PNG o
							WebP. Si dejas vacío un producto, el sistema usará la imagen
							predeterminada por nombre/categoría.
						</div>
						<div className="grid gap-4">
							{products.map((product) => (
								<ProductImageEditor
									key={product.id}
									product={product}
									onSave={saveProductImage}
									isSaving={updateProductMutation.isPending}
								/>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{active === "fiscal" && (
				<Card>
					<CardHeader>
						<CardTitle>Configuración fiscal</CardTitle>
						<CardDescription>
							Los datos fiscales siguen en el formulario especializado para no
							mezclar certificados, NFC-e y datos visuales.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-sm">
							Desde aquí entras a la configuración fiscal. Esta pestaña reemplaza
							el acceso escondido que antes estaba fuera de Configuración.
						</p>
						<Button asChild>
							<Link href="/admin/fiscal/settings">
								Abrir configuración fiscal
							</Link>
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function ColorField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<div className="flex gap-2">
				<Input
					type="color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-10 w-14 p-1"
				/>
				<Input value={value} onChange={(event) => onChange(event.target.value)} />
			</div>
		</div>
	);
}

function ProductImageEditor({
	product,
	onSave,
	isSaving,
}: {
	product: {
		id: number;
		name: string;
		category: string | null;
		image_url: string | null;
	};
	onSave: (id: number, imageUrl: string) => void;
	isSaving: boolean;
}) {
	const [value, setValue] = useState(product.image_url ?? "");

	useEffect(() => {
		setValue(product.image_url ?? "");
	}, [product.image_url]);

	return (
		<div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[88px_1fr_auto] sm:items-center">
			<ProductImage
				src={value || product.image_url}
				category={product.category}
				alt={product.name}
				className="h-20 w-20"
			/>
			<div className="min-w-0 space-y-2">
				<div>
					<p className="truncate font-medium">{product.name}</p>
					<p className="text-muted-foreground text-xs">
						{product.category ?? "Sin categoría"}
					</p>
				</div>
				<Input
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder="https://sitio.com/imagen.jpg o /product-images/archivo.jpg"
				/>
			</div>
			<Button
				type="button"
				onClick={() => onSave(product.id, value.trim())}
				disabled={isSaving}
			>
				Guardar
			</Button>
		</div>
	);
}

function Preview({ form }: { form: Record<string, string> }) {
	const primaryText = getContrastColor(form.primary_color);
	const accentText = getContrastColor(form.accent_color);
	const cardText = getContrastColor(form.card_color);

	return (
		<div
			className="rounded-xl border p-4"
			style={{
				backgroundColor: form.background_color,
				color: form.text_color,
			}}
		>
			<div
				className="mb-3 rounded-lg px-4 py-3 font-bold"
				style={{ backgroundColor: form.primary_color, color: primaryText }}
			>
				{form.company_title}
			</div>
			<div
				className="rounded-lg border p-4"
				style={{ backgroundColor: form.card_color, color: cardText }}
			>
				<p className="font-medium">Vista previa</p>
				<p className="text-sm opacity-80">
					Así se verá la identidad base del sistema.
				</p>
				<span
					className="mt-3 inline-flex rounded-full px-3 py-1 text-sm"
					style={{ backgroundColor: form.accent_color, color: accentText }}
				>
					Color de acento
				</span>
			</div>
		</div>
	);
}
