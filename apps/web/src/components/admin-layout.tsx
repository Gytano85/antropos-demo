"use client";

import { Button } from "@finopenpos/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@finopenpos/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import {
	BookOpenIcon,
	BrainCircuitIcon,
	Building2Icon,
	CalendarCheckIcon,
	CameraIcon,
	CreditCardIcon,
	DollarSignIcon,
	LayoutDashboardIcon,
	type LucideIcon,
	MenuIcon,
	Package2Icon,
	PackageIcon,
	ReceiptTextIcon,
	ScaleIcon,
	SettingsIcon,
	ShoppingBagIcon,
	UsersIcon,
	UtensilsIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useTRPC } from "@/lib/trpc/client";

interface NavItem {
	href: string;
	labelKey:
		| "dashboard"
		| "cashier"
		| "inventory"
		| "customers"
		| "orders"
		| "paymentMethods"
		| "invoices"
		| "fiscalSettings"
		| "settings"
		| "tables"
		| "menuEngine"
		| "digitalMenu"
		| "attendance"
		| "alcoholControl"
		| "visionOps"
		| "cameras"
		| "branches";
	icon: LucideIcon;
	permission?: string;
}

const navItems: NavItem[] = [
	{ href: "/admin", labelKey: "dashboard", icon: LayoutDashboardIcon, permission: "dashboard.view" },
	{ href: "/admin/tables", labelKey: "tables", icon: UtensilsIcon, permission: "sales.view" },
	{
		href: "/admin/attendance",
		labelKey: "attendance",
		icon: CalendarCheckIcon,
		permission: "attendance.view",
	},
	{
		href: "/admin/alcohol-control",
		labelKey: "alcoholControl",
		icon: ScaleIcon,
		permission: "cameras.view",
	},
	{ href: "/admin/cameras", labelKey: "cameras", icon: CameraIcon, permission: "cameras.view" },
	{ href: "/menu", labelKey: "digitalMenu", icon: BookOpenIcon, permission: "menu.view" },
	{
		href: "/admin/menu-engine",
		labelKey: "menuEngine",
		icon: BrainCircuitIcon,
		permission: "menu.view",
	},
	{ href: "/admin/cashier", labelKey: "cashier", icon: DollarSignIcon, permission: "sales.view" },
	{ href: "/admin/inventory", labelKey: "inventory", icon: PackageIcon, permission: "inventory.view" },
	{ href: "/admin/customers", labelKey: "customers", icon: UsersIcon, permission: "customers.manage" },
	{ href: "/admin/orders", labelKey: "orders", icon: ShoppingBagIcon, permission: "sales.view" },
	{
		href: "/admin/payment-methods",
		labelKey: "paymentMethods",
		icon: CreditCardIcon,
		permission: "settings.manage",
	},
	{ href: "/admin/fiscal", labelKey: "invoices", icon: ReceiptTextIcon, permission: "fiscal.manage" },
	{ href: "/admin/settings", labelKey: "settings", icon: SettingsIcon, permission: "settings.manage" },
	{ href: "/admin/branches", labelKey: "branches", icon: Building2Icon, permission: "branches.manage" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
	const trpc = useTRPC();
	const pathname = usePathname();
	const router = useRouter();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [sidebarExpanded, setSidebarExpanded] = useState(false);
	const t = useTranslations("nav");
	const { data: appSettings } = useQuery(trpc.appSettings.get.queryOptions());
	const { data: activeBranch } = useQuery(trpc.branches.active.queryOptions());
	const visibleNavItems = navItems.filter(
		(item) => !item.permission || activeBranch?.permissions.includes(item.permission),
	);

	useEffect(() => {
		if (!activeBranch) return;
		const route = navItems
			.filter((item) => item.href !== "/admin" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
			.sort((a, b) => b.href.length - a.href.length)[0];
		if (route?.permission && !activeBranch.permissions.includes(route.permission)) {
			router.replace(visibleNavItems[0]?.href ?? "/branches");
		}
	}, [activeBranch, pathname, router, visibleNavItems]);

	return (
		<div className="flex min-h-screen w-full flex-col bg-muted/40">
			<header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 sm:gap-4 sm:px-4">
				<Button
					variant="ghost"
					size="icon"
					className="shrink-0 sm:hidden"
					onClick={() => setMobileMenuOpen(true)}
				>
					<MenuIcon className="h-5 w-5" />
					<span className="sr-only">{t("openMenu")}</span>
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="hidden shrink-0 sm:inline-flex"
					onClick={() => setSidebarExpanded((expanded) => !expanded)}
					aria-expanded={sidebarExpanded}
					aria-controls="desktop-sidebar"
				>
					<MenuIcon className="h-5 w-5" />
					<span className="sr-only">
						{t(sidebarExpanded ? "closeMenu" : "openMenu")}
					</span>
				</Button>
				<Link
					href="/admin"
					className="flex items-center gap-2 font-semibold text-lg"
				>
					<Package2Icon className="h-6 w-6" />
					<span>{appSettings?.company_title ?? "Antro POS"}</span>
				</Link>
				<div className="ml-auto flex items-center gap-2">
					<Button variant="outline" size="sm" asChild className="max-w-52 gap-2">
						<Link href="/branches"><Building2Icon className="h-4 w-4 shrink-0" /><span className="truncate">{activeBranch?.name ?? "Cambiar sucursal"}</span></Link>
					</Button>
					<LocaleSwitcher />
				</div>
			</header>

			{/* Mobile drawer overlay */}
			{mobileMenuOpen && (
				<div className="fixed inset-0 z-50 sm:hidden">
					<button
						type="button"
						aria-label={t("closeMenu")}
						className="fixed inset-0 bg-black/50"
						onClick={() => setMobileMenuOpen(false)}
					/>
					<nav className="fixed inset-y-0 left-0 flex w-64 flex-col gap-2 overflow-y-auto border-r bg-background p-4">
						<div className="mb-4 flex items-center justify-between">
							<Link
								href="/admin"
								className="flex items-center gap-2 font-semibold text-lg"
								onClick={() => setMobileMenuOpen(false)}
							>
								<Package2Icon className="h-6 w-6" />
								<span>{appSettings?.company_title ?? "Antro POS"}</span>
							</Link>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setMobileMenuOpen(false)}
							>
								<XIcon className="h-5 w-5" />
							</Button>
						</div>
						{visibleNavItems.map(({ href, labelKey, icon: Icon }) => (
							<Link
								key={href}
								href={href}
								onClick={() => setMobileMenuOpen(false)}
								className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
									pathname === href || pathname.startsWith(`${href}/`)
										? "bg-accent font-medium text-accent-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
								}`}
							>
								<Icon className="h-5 w-5 shrink-0" />
								{t(labelKey)}
							</Link>
						))}
					</nav>
				</div>
			)}

			<div
				className={`flex flex-col transition-[padding] duration-200 sm:gap-4 sm:py-4 ${
					sidebarExpanded ? "sm:pl-64" : "sm:pl-14"
				}`}
			>
				<aside
					id="desktop-sidebar"
					className={`fixed inset-y-0 left-0 z-10 mt-[56px] hidden flex-col overflow-x-hidden border-r bg-background transition-[width] duration-200 sm:flex ${
						sidebarExpanded ? "w-64" : "w-14"
					}`}
				>
					<nav
						className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 sm:py-5 ${
							sidebarExpanded ? "items-stretch" : "items-center"
						}`}
					>
						<TooltipProvider>
							{visibleNavItems.map(({ href, labelKey, icon: Icon }) => (
								<Tooltip key={href}>
									<TooltipTrigger asChild>
										<Link
											href={href}
											className={`flex h-10 items-center rounded-lg transition-colors ${
												sidebarExpanded
													? "w-full justify-start gap-3 px-3"
													: "w-9 justify-center"
											} ${
												pathname === href || pathname.startsWith(`${href}/`)
													? "bg-accent text-accent-foreground"
													: "text-muted-foreground"
											} hover:bg-muted hover:text-foreground`}
										>
											<Icon className="h-5 w-5 shrink-0" />
											<span
												className={
													sidebarExpanded
														? "truncate font-medium text-sm"
														: "sr-only"
												}
											>
												{t(labelKey)}
											</span>
										</Link>
									</TooltipTrigger>
									{!sidebarExpanded && (
										<TooltipContent side="right">{t(labelKey)}</TooltipContent>
									)}
								</Tooltip>
							))}
						</TooltipProvider>
					</nav>
				</aside>
				<main className="flex-1 overflow-x-hidden p-3 sm:px-6 sm:py-0">
					{children}
				</main>
			</div>
		</div>
	);
}
