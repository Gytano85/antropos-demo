"use client";

import { Button } from "@finopenpos/ui/components/button";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import { MartiniIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { login } from "./actions";
import { TestAccountPicker } from "./test-accounts";

export default function LoginPage() {
	const t = useTranslations("login");

	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
			{/* Halo detras de la tarjeta: da profundidad sin competir con el
			    formulario, que es lo unico accionable de la pantalla. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)]"
			/>

			<div className="absolute top-4 right-4 z-10">
				<LocaleSwitcher />
			</div>

			<div className="relative z-10 w-full max-w-sm">
				<div className="mb-7 flex flex-col items-center text-center">
					<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
						<MartiniIcon className="h-6 w-6" />
					</div>
					<h1 className="font-semibold text-2xl tracking-tight">
						{t("title")}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
				</div>

				<div className="rounded-2xl border bg-card p-6 shadow-sm">
					<form action={login} className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="email" className="text-xs">
								{t("email")}
							</Label>
							<Input
								id="email"
								name="email"
								type="email"
								defaultValue="test@example.com"
								placeholder={t("emailPlaceholder")}
								required
								autoComplete="email"
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="password" className="text-xs">
								{t("password")}
							</Label>
							<Input
								id="password"
								name="password"
								type="password"
								defaultValue="test1234"
								required
								autoComplete="current-password"
							/>
						</div>

						<Button className="w-full" type="submit" size="lg">
							{t("submit")}
						</Button>
					</form>

					<div className="mt-5">
						<TestAccountPicker />
					</div>
				</div>

				<p className="mt-5 text-center text-muted-foreground text-sm">
					{t("noAccount")}{" "}
					<Link
						href="/signup"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{t("signUp")}
					</Link>
				</p>
			</div>
		</div>
	);
}
