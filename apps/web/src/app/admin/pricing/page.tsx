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
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@finopenpos/ui/components/table";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	Loader2Icon,
	TrendingDownIcon,
	TrendingUpIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export default function PricingPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const t = useTranslations("pricing");
	const tt = useTranslations("tables");
	const tc = useTranslations("common");

	const { data: settings, isLoading } = useQuery(
		trpc.pricing.getSettings.queryOptions(),
	);
	const { data: status } = useQuery(
		trpc.pricing.getStatus.queryOptions(undefined, {
			refetchInterval: 15_000,
		}),
	);

	const updateMutation = useMutation(
		trpc.pricing.updateSettings.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries(trpc.pricing.getSettings.queryOptions()),
					queryClient.invalidateQueries(trpc.pricing.getStatus.queryOptions()),
				]);
				toast.success(t("saved"));
			},
			onError: (error) => toast.error(error.message || t("saveError")),
		}),
	);

	const form = useForm({
		defaultValues: {
			enabled: settings?.enabled ?? true,
			capacity: settings?.capacity ?? 15,
			minAdjustmentPct: settings?.minAdjustmentPct ?? -15,
			maxAdjustmentPct: settings?.maxAdjustmentPct ?? 25,
			drunkThreshold: settings?.drunkThreshold ?? 3,
			drunkSurgePct: settings?.drunkSurgePct ?? 20,
		},
		onSubmit: ({ value }) => {
			updateMutation.mutate(value);
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				enabled: settings.enabled,
				capacity: settings.capacity,
				minAdjustmentPct: settings.minAdjustmentPct,
				maxAdjustmentPct: settings.maxAdjustmentPct,
				drunkThreshold: settings.drunkThreshold,
				drunkSurgePct: settings.drunkSurgePct,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settings]);

	if (isLoading) {
		return (
			<div className="space-y-6 max-w-3xl">
				<Card>
					<CardHeader>
						<Skeleton className="h-8 w-48" />
					</CardHeader>
					<CardContent className="space-y-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6 max-w-3xl">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-6"
			>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<div>
							<CardTitle>{t("title")}</CardTitle>
							<CardDescription>{t("subtitle")}</CardDescription>
						</div>
						<form.Field name="enabled">
							{(field) => (
								<Button
									type="button"
									variant={field.state.value ? "default" : "outline"}
									onClick={() => field.handleChange(!field.state.value)}
								>
									{field.state.value ? t("enabled") : t("disabled")}
								</Button>
							)}
						</form.Field>
					</CardHeader>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("occupancySection")}</CardTitle>
						<CardDescription>{t("occupancySectionHint")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-3">
						<form.Field name="capacity">
							{(field) => (
								<div className="space-y-2">
									<Label>{t("capacity")}</Label>
									<Input
										type="number"
										min={1}
										max={500}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(Number(e.target.value))
										}
									/>
									<p className="text-muted-foreground text-xs">
										{t("capacityHint")}
									</p>
								</div>
							)}
						</form.Field>
						<form.Field name="minAdjustmentPct">
							{(field) => (
								<div className="space-y-2">
									<Label>{t("minAdjustmentPct")}</Label>
									<Input
										type="number"
										min={-90}
										max={100}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(Number(e.target.value))
										}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="maxAdjustmentPct">
							{(field) => (
								<div className="space-y-2">
									<Label>{t("maxAdjustmentPct")}</Label>
									<Input
										type="number"
										min={-90}
										max={300}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(Number(e.target.value))
										}
									/>
								</div>
							)}
						</form.Field>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("intoxicationSection")}</CardTitle>
						<CardDescription>{t("intoxicationSectionHint")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<form.Field name="drunkThreshold">
							{(field) => (
								<div className="space-y-2">
									<Label>{t("drunkThreshold")}</Label>
									<Input
										type="number"
										min={0.1}
										max={50}
										step={0.5}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(Number(e.target.value))
										}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="drunkSurgePct">
							{(field) => (
								<div className="space-y-2">
									<Label>{t("drunkSurgePct")}</Label>
									<Input
										type="number"
										min={0}
										max={500}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(Number(e.target.value))
										}
									/>
								</div>
							)}
						</form.Field>
					</CardContent>
				</Card>

				<div className="flex justify-end">
					<Button type="submit" disabled={updateMutation.isPending} size="lg">
						{updateMutation.isPending && (
							<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
						)}
						{tc("save")}
					</Button>
				</div>
			</form>

			{status && (
				<Card>
					<CardHeader>
						<CardTitle>{t("currentStatus")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="rounded-lg border p-3">
								<p className="text-muted-foreground text-sm">
									{t("openTablesCount")}
								</p>
								<p className="font-bold text-2xl">{status.openTablesCount}</p>
							</div>
							<div className="rounded-lg border p-3">
								<p className="text-muted-foreground text-sm">
									{t("occupancyRatio")}
								</p>
								<p className="font-bold text-2xl">
									{Math.round(status.occupancyRatio * 100)}%
								</p>
							</div>
							<div className="rounded-lg border p-3">
								<p className="text-muted-foreground text-sm">
									{t("currentAdjustment")}
								</p>
								<p className="flex items-center gap-1 font-bold text-2xl">
									{status.occupancyAdjustmentPct > 0 ? (
										<TrendingUpIcon className="h-5 w-5 text-amber-500" />
									) : status.occupancyAdjustmentPct < 0 ? (
										<TrendingDownIcon className="h-5 w-5 text-emerald-500" />
									) : null}
									{status.occupancyAdjustmentPct > 0 ? "+" : ""}
									{status.occupancyAdjustmentPct}%
								</p>
							</div>
						</div>

						<div>
							<p className="mb-2 font-medium text-sm">{t("flaggedTables")}</p>
							{status.tables.filter((table) => table.flagged).length === 0 ? (
								<p className="text-muted-foreground text-sm">
									{t("noFlaggedTables")}
								</p>
							) : (
								<div className="overflow-x-auto rounded-lg border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{tt("openTables")}</TableHead>
												<TableHead>{tt("partySize")}</TableHead>
												<TableHead>{tc("category")}</TableHead>
												<TableHead />
											</TableRow>
										</TableHeader>
										<TableBody>
											{status.tables
												.filter((table) => table.flagged)
												.map((table) => (
													<TableRow key={table.orderId}>
														<TableCell className="font-medium">
															{table.tableName ?? tt("unnamedTable")}
														</TableCell>
														<TableCell>{table.partySize}</TableCell>
														<TableCell>
															{table.alcoholUnits} (
															{table.unitsPerPerson.toFixed(1)}/persona)
														</TableCell>
														<TableCell>
															<Badge variant="destructive" className="gap-1">
																<AlertTriangleIcon className="h-3.5 w-3.5" />
																{tt("possibleOverconsumption")}
															</Badge>
														</TableCell>
													</TableRow>
												))}
										</TableBody>
									</Table>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
