"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ClipboardCheckIcon,
	ShieldAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/lib/trpc/client";

export default function InventoryAuditPage() {
	const trpc = useTRPC();
	const t = useTranslations("inventoryAudit");
	const { data, isLoading } = useQuery(
		trpc.recipes.warnings.queryOptions(undefined, {
			refetchInterval: 15_000,
		}),
	);

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-36 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}

	const totalWarnings = data.countWarnings.length + data.orderWarnings.length;

	return (
		<div className="space-y-6">
			<Card
				className={
					totalWarnings > 0
						? "border-red-300 bg-red-50/60"
						: "border-emerald-300 bg-emerald-50/60"
				}
			>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{totalWarnings > 0 ? (
							<ShieldAlertIcon className="h-6 w-6 text-red-600" />
						) : (
							<CheckCircle2Icon className="h-6 w-6 text-emerald-600" />
						)}
						{totalWarnings > 0 ? t("reviewRequired") : t("allClear")}
					</CardTitle>
					<CardDescription>
						{t("explanation", { percent: data.tolerancePercent })}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-3">
					<Badge variant={totalWarnings > 0 ? "destructive" : "outline"}>
						{t("warningCount", { count: totalWarnings })}
					</Badge>
					<p className="text-muted-foreground text-sm">{t("notProof")}</p>
				</CardContent>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2">
				<Summary
					icon={ClipboardCheckIcon}
					label={t("physicalDifferences")}
					value={data.countWarnings.length}
				/>
				<Summary
					icon={AlertTriangleIcon}
					label={t("orderDifferences")}
					value={data.orderWarnings.length}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("physicalTitle")}</CardTitle>
					<CardDescription>{t("physicalHint")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{data.countWarnings.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("none")}</p>
					) : (
						data.countWarnings.map((warning) => (
							<div
								key={warning.id}
								className="rounded-lg border border-red-200 bg-red-50 p-4"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="font-semibold">{warning.ingredient.name}</p>
									<Badge variant="destructive">
										{warning.variance_percent > 0 ? "+" : ""}
										{warning.variance_percent.toFixed(1)}%
									</Badge>
								</div>
								<p className="mt-1 text-sm">
									{t("physicalDetail", {
										expected: warning.expected_quantity.toFixed(2),
										counted: warning.counted_quantity.toFixed(2),
										unit:
											warning.ingredient.unit === "unit"
												? t("units")
												: warning.ingredient.unit,
									})}
								</p>
							</div>
						))
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("ordersTitle")}</CardTitle>
					<CardDescription>{t("ordersHint")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{data.orderWarnings.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("none")}</p>
					) : (
						data.orderWarnings.map((warning, index) => (
							<div
								key={`${warning.orderId}-${warning.ingredientName}-${index}`}
								className="rounded-lg border border-amber-200 bg-amber-50 p-4"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="font-semibold">
										{warning.tableName ?? `Orden #${warning.orderId}`} ·{" "}
										{warning.productName}
									</p>
									<Badge className="bg-amber-600 text-white">
										{warning.variancePercent > 0 ? "+" : ""}
										{warning.variancePercent.toFixed(1)}%
									</Badge>
								</div>
								<p className="mt-1 text-sm">
									{t("orderDetail", {
										ingredient: warning.ingredientName,
										expected: warning.expectedQuantity.toFixed(2),
										recorded: warning.recordedQuantity.toFixed(2),
										unit: warning.unit === "unit" ? t("units") : warning.unit,
									})}
								</p>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function Summary({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof ClipboardCheckIcon;
	label: string;
	value: number;
}) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-3xl">{value}</p>
				</div>
				<Icon className="h-8 w-8 text-amber-600" />
			</CardContent>
		</Card>
	);
}
