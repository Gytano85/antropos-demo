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
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, Package2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { z } from "zod/v4";
import { toast } from "sonner";
import { hexToHslString, isHexDark } from "@/lib/branding/color";
import { useTRPC } from "@/lib/trpc/client";

export default function SettingsPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const t = useTranslations("settings");
	const tc = useTranslations("common");

	const { data: settings, isLoading } = useQuery(
		trpc.branding.getSettings.queryOptions(),
	);

	const updateMutation = useMutation(
		trpc.branding.updateSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(
					trpc.branding.getSettings.queryOptions(),
				);
				toast.success(t("saved"));
			},
			onError: (error) => toast.error(error.message || t("saveError")),
		}),
	);

	const formSchema = z.object({
		companyName: z.string().trim().min(1, t("companyNameRequired")).max(100),
		primaryColor: z
			.string()
			.trim()
			.regex(/^#[0-9a-fA-F]{6}$/, t("invalidColor")),
	});

	const form = useForm({
		defaultValues: {
			companyName: settings?.companyName ?? "",
			primaryColor: settings?.primaryColor ?? "#0f172a",
		},
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			updateMutation.mutate(value);
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				companyName: settings.companyName,
				primaryColor: settings.primaryColor,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settings]);

	if (isLoading) {
		return (
			<div className="max-w-2xl space-y-6">
				<Card>
					<CardHeader>
						<Skeleton className="h-8 w-48" />
					</CardHeader>
					<CardContent className="space-y-4">
						{Array.from({ length: 2 }).map((_, i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="max-w-2xl space-y-6">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-6"
			>
				<Card>
					<CardHeader>
						<CardTitle>{t("title")}</CardTitle>
						<CardDescription>{t("subtitle")}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form.Field name="companyName">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="companyName">{t("companyName")}</Label>
									<Input
										id="companyName"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										error={
											field.state.meta.errors.length > 0
												? field.state.meta.errors
														.map((e) => e?.message ?? e)
														.join(", ")
												: undefined
										}
									/>
									<p className="text-muted-foreground text-xs">
										{t("companyNameHint")}
									</p>
								</div>
							)}
						</form.Field>

						<form.Field name="primaryColor">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="primaryColor">{t("primaryColor")}</Label>
									<div className="flex items-center gap-3">
										<input
											type="color"
											aria-label={t("primaryColor")}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											className="h-10 w-14 cursor-pointer rounded border"
										/>
										<Input
											id="primaryColor"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											placeholder="#0f172a"
											className="flex-1"
											error={
												field.state.meta.errors.length > 0
													? field.state.meta.errors
															.map((e) => e?.message ?? e)
															.join(", ")
													: undefined
											}
										/>
									</div>
									<p className="text-muted-foreground text-xs">
										{t("primaryColorHint")}
									</p>
								</div>
							)}
						</form.Field>

						{/* Live preview */}
						<form.Subscribe
							selector={(state) => [
								state.values.companyName,
								state.values.primaryColor,
							]}
						>
							{([companyName, primaryColor]) => {
								const hsl = hexToHslString(primaryColor) ?? "222.2 47.4% 11.2%";
								const style = {
									"--primary": hsl,
									"--primary-foreground": isHexDark(primaryColor)
										? "0 0% 100%"
										: "222.2 47.4% 11.2%",
								} as React.CSSProperties;
								return (
									<div className="space-y-2 pt-2">
										<Label>{t("preview")}</Label>
										<div
											style={style}
											className="flex items-center justify-between rounded-lg border bg-background p-3"
										>
											<div className="flex items-center gap-2 font-semibold">
												<Package2Icon className="h-5 w-5 text-primary" />
												<span>{companyName || t("previewBrandLabel")}</span>
											</div>
											<Button type="button" size="sm">
												{tc("save")}
											</Button>
										</div>
									</div>
								);
							}}
						</form.Subscribe>
					</CardContent>
				</Card>

				<div className="flex justify-end">
					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button
								type="submit"
								size="lg"
								disabled={isSubmitting || updateMutation.isPending}
							>
								{updateMutation.isPending && (
									<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
								)}
								{tc("save")}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>
		</div>
	);
}
