"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

function hexToHsl(hex: string) {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
	const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
	const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h /= 6;
	}

	return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getContrastColor(hex: string) {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.62 ? "#111827" : "#ffffff";
}

function lighten(hex: string, amount: number) {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	const mix = (value: number) =>
		Math.round(value + (255 - value) * amount)
			.toString(16)
			.padStart(2, "0");
	return `#${mix(r)}${mix(g)}${mix(b)}`;
}

export function applyAdminTheme(data: {
	company_title?: string;
	primary_color: string;
	accent_color: string;
	background_color: string;
	card_color: string;
	text_color: string;
}) {
	const root = document.documentElement;
	const primaryForeground = getContrastColor(data.primary_color);
	const accentForeground = getContrastColor(data.accent_color);
	const muted = lighten(data.background_color, 0.08);
	const border = lighten(data.text_color, 0.82);

	root.style.setProperty("--primary", hexToHsl(data.primary_color));
	root.style.setProperty("--primary-foreground", hexToHsl(primaryForeground));
	root.style.setProperty("--ring", hexToHsl(data.primary_color));
	root.style.setProperty("--accent", hexToHsl(data.accent_color));
	root.style.setProperty("--accent-foreground", hexToHsl(accentForeground));
	root.style.setProperty("--secondary", hexToHsl(lighten(data.primary_color, 0.85)));
	root.style.setProperty("--secondary-foreground", hexToHsl(data.text_color));
	root.style.setProperty("--background", hexToHsl(data.background_color));
	root.style.setProperty("--card", hexToHsl(data.card_color));
	root.style.setProperty("--popover", hexToHsl(data.card_color));
	root.style.setProperty("--muted", hexToHsl(muted));
	root.style.setProperty("--foreground", hexToHsl(data.text_color));
	root.style.setProperty("--card-foreground", hexToHsl(data.text_color));
	root.style.setProperty("--popover-foreground", hexToHsl(data.text_color));
	root.style.setProperty("--muted-foreground", hexToHsl(lighten(data.text_color, 0.35)));
	root.style.setProperty("--border", hexToHsl(border));
	root.style.setProperty("--input", hexToHsl(border));
	if (data.company_title) document.title = data.company_title;
}

export function AdminThemeApplier() {
	const trpc = useTRPC();
	const { data } = useQuery(trpc.appSettings.get.queryOptions());

	useEffect(() => {
		if (!data) return;
		applyAdminTheme(data);
	}, [data]);

	return null;
}
