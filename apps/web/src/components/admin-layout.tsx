"use client";

import { Button } from "@finopenpos/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@finopenpos/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@finopenpos/ui/components/tooltip";
import {
	BookOpenIcon,
	CreditCardIcon,
	DollarSignIcon,
	FlaskConicalIcon,
	LayoutDashboardIcon,
	type LucideIcon,
	MenuIcon,
	Package2Icon,
	PackageIcon,
	ReceiptTextIcon,
	SettingsIcon,
	ShieldAlertIcon,
	ShoppingBagIcon,
	ShoppingCartIcon,
	TrendingUpIcon,
	TruckIcon,
	UsersIcon,
	UtensilsIcon,
	XIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";

interface NavItem {
	href: string;
	labelKey:
		| "dashboard"
		| "cashier"
		| "products"
		| "restocking"
		| "recipes"
		| "inventoryAudit"
		| "customers"
		| "orders"
		| "paymentMethods"
		| "pos"
		| "invoices"
		| "fiscalSettings"
		| "tables"
		| "digitalMenu"
		| "dynamicPricing";
	icon: LucideIcon;
}

const navItems: NavItem[] = [
	{ href: "/admin", labelKey: "dashboard", icon: LayoutDashboardIcon },
	{ href: "/admin/tables", labelKey: "tables", icon: UtensilsIcon },
	{ href: "/menu", labelKey: "digitalMenu", icon: BookOpenIcon },
	{ href: "/admin/cashier", labelKey: "cashier", icon: DollarSignIcon },
	{ href: "/admin/products", labelKey: "products", icon: PackageIcon },
	{ href: "/admin/restocking", labelKey: "restocking", icon: TruckIcon },
	{ href: "/admin/recipes", labelKey: "recipes", icon: FlaskConicalIcon },
	{
		href: "/admin/inventory-audit",
		labelKey: "inventoryAudit",
		icon: ShieldAlertIcon,
	},
	{ href: "/admin/customers", labelKey: "customers", icon: UsersIcon },
	{ href: "/admin/orders", labelKey: "orders", icon: ShoppingBagIcon },
	{
		href: "/admin/payment-methods",
		labelKey: "paymentMethods",
		icon: CreditCardIcon,
	},
	{ href: "/admin/pos", labelKey: "pos", icon: ShoppingCartIcon },
	{ href: "/admin/pricing", labelKey: "dynamicPricing", icon: TrendingUpIcon },
	{ href: "/admin/fiscal", labelKey: "invoices", icon: ReceiptTextIcon },
	{
		href: "/admin/fiscal/settings",
		labelKey: "fiscalSettings",
		icon: SettingsIcon,
	},
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [sidebarExpanded, setSidebarExpanded] = useState(false);
	const t = useTranslations("nav");

	const pageNames: Record<string, string> = Object.fromEntries(
		navItems.map((item) => [item.href, t(item.labelKey)]),
	);

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
					className="hidden items-center gap-2 font-semibold text-lg sm:flex"
				>
					<Package2Icon className="h-6 w-6" />
					<span className="sr-only">{t("adminPanel")}</span>
				</Link>
				<h1 className="truncate font-bold text-lg sm:text-xl">
					{pageNames[pathname]}
				</h1>
				<div className="ml-auto flex items-center gap-2">
					<LocaleSwitcher />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 overflow-hidden rounded-full"
							>
								<Image
									src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/placeholder-user.jpg`}
									width={36}
									height={36}
									alt="Avatar"
									className="overflow-hidden rounded-full"
								/>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>{t("myAccount")}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem>{t("settings")}</DropdownMenuItem>
							<DropdownMenuItem>{t("support")}</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => logout()}>
								{t("logout")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
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
								<span>Antro POS</span>
							</Link>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setMobileMenuOpen(false)}
							>
								<XIcon className="h-5 w-5" />
							</Button>
						</div>
						{navItems.map(({ href, labelKey, icon: Icon }) => (
							<Link
								key={href}
								href={href}
								onClick={() => setMobileMenuOpen(false)}
								className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
									pathname === href
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
							{navItems.map(({ href, labelKey, icon: Icon }) => (
								<Tooltip key={href}>
									<TooltipTrigger asChild>
										<Link
											href={href}
											className={`flex h-10 items-center rounded-lg transition-colors ${
												sidebarExpanded
													? "w-full justify-start gap-3 px-3"
													: "w-9 justify-center"
											} ${
												pathname === href
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
