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
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangleIcon,
	BoxIcon,
	CalendarClockIcon,
	SearchIcon,
	ShoppingCartIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

export default function RestockingPage() {
	const trpc = useTRPC();
	const t = useTranslations("restocking");
	const [days, setDays] = useState<7 | 30 | 90>(30);
	const [leadTimeDays, setLeadTimeDays] = useState(7);
	const [coverageDays, setCoverageDays] = useState(14);
	const [search, setSearch] = useState("");

	const { data, isLoading } = useQuery(
		trpc.restocking.recommendations.queryOptions({
			days,
			leadTimeDays,
			coverageDays,
		}),
	);

	const items = useMemo(() => {
		if (!data) return [];
		const term = search.trim().toLowerCase();
		return term
			? data.items.filter((item) => item.name.toLowerCase().includes(term))
			: data.items;
	}, [data, search]);

	const statusBadge = (status: (typeof items)[number]["status"]) => {
		if (status === "urgent") {
			return <Badge variant="destructive">{t("urgent")}</Badge>;
		}
		if (status === "soon") {
			return (
				<Badge className="border-amber-200 bg-amber-100 text-amber-800">
					{t("soon")}
				</Badge>
			);
		}
		if (status === "healthy") {
			return (
				<Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
					{t("healthy")}
				</Badge>
			);
		}
		return <Badge variant="outline">{t("noDemand")}</Badge>;
	};

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-80 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("subtitle")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label>{t("historyWindow")}</Label>
						<Select
							value={String(days)}
							onValueChange={(value) => setDays(Number(value) as 7 | 30 | 90)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="7">{t("lastDays", { days: 7 })}</SelectItem>
								<SelectItem value="30">
									{t("lastDays", { days: 30 })}
								</SelectItem>
								<SelectItem value="90">
									{t("lastDays", { days: 90 })}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="lead-time">{t("leadTime")}</Label>
						<Input
							id="lead-time"
							type="number"
							min={1}
							max={60}
							value={leadTimeDays}
							onChange={(event) =>
								setLeadTimeDays(
									Math.min(60, Math.max(1, Number(event.target.value) || 1)),
								)
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="coverage">{t("coverage")}</Label>
						<Input
							id="coverage"
							type="number"
							min={1}
							max={90}
							value={coverageDays}
							onChange={(event) =>
								setCoverageDays(
									Math.min(90, Math.max(1, Number(event.target.value) || 1)),
								)
							}
						/>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<SummaryCard
					icon={BoxIcon}
					label={t("analyzedProducts")}
					value={data.totalProducts}
				/>
				<SummaryCard
					icon={AlertTriangleIcon}
					label={t("urgentProducts")}
					value={data.urgentCount}
					accent="text-red-600"
				/>
				<SummaryCard
					icon={CalendarClockIcon}
					label={t("soonProducts")}
					value={data.soonCount}
					accent="text-amber-600"
				/>
				<SummaryCard
					icon={ShoppingCartIcon}
					label={t("suggestedUnits")}
					value={data.recommendedUnits}
					accent="text-blue-600"
				/>
			</div>

			<Card>
				<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle>{t("recommendations")}</CardTitle>
						<CardDescription>
							{t("formulaHint", { leadTimeDays, coverageDays })}
						</CardDescription>
					</div>
					<div className="relative w-full sm:w-72">
						<SearchIcon className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("search")}
							className="pl-9"
						/>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("product")}</TableHead>
									<TableHead>{t("status")}</TableHead>
									<TableHead className="text-right">{t("stock")}</TableHead>
									<TableHead className="text-right">{t("unitsSold")}</TableHead>
									<TableHead className="text-right">
										{t("dailyDemand")}
									</TableHead>
									<TableHead className="text-right">
										{t("daysRemaining")}
									</TableHead>
									<TableHead className="text-right">
										{t("reorderPoint")}
									</TableHead>
									<TableHead className="text-right">{t("buy")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.productId}>
										<TableCell>
											<p className="font-medium">{item.name}</p>
											<p className="text-muted-foreground text-xs">
												{item.category ?? "—"}
											</p>
										</TableCell>
										<TableCell>{statusBadge(item.status)}</TableCell>
										<TableCell className="text-right">
											{item.currentStock}
										</TableCell>
										<TableCell className="text-right">
											{item.unitsSold}
										</TableCell>
										<TableCell className="text-right">
											{item.averageDailyDemand.toFixed(2)}
										</TableCell>
										<TableCell className="text-right">
											{item.daysRemaining === null
												? "—"
												: t("daysValue", { days: item.daysRemaining })}
										</TableCell>
										<TableCell className="text-right">
											{item.reorderPoint}
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
											colSpan={8}
											className="h-24 text-center text-muted-foreground"
										>
											{t("noResults")}
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
