"use client";

import { login } from "./actions";
import { Card, CardContent, CardFooter } from "@finopenpos/ui/components/card";
import { Label } from "@finopenpos/ui/components/label";
import { Input } from "@finopenpos/ui/components/input";
import Link from "next/link";
import { Button } from "@finopenpos/ui/components/button";
import { MountainIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function LoginPage() {
  const t = useTranslations("login");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
      </div>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <MountainIcon className="h-10 w-10" />
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Card>
          <form action={login}>
            <CardContent className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("email")}</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  defaultValue="test1234"
                  required
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button className="w-full" type="submit">
                {t("submit")}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t("noAccount")}{" "}
                <Link
                  href="/signup"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t("signUp")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
