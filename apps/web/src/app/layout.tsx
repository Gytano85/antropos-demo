import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { CookieConsent } from "@/components/cookie-consent";
import { TRPCReactProvider } from "@/components/trpc-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: "APOS by Blinder",
	description: "Sistema de punto de venta para antros y bares",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale}>
			<body className="font-sans">
				<NextIntlClientProvider locale={locale} messages={messages}>
					<TRPCReactProvider>
						<main>{children}</main>
						<Toaster richColors position="bottom-right" />
						<CookieConsent />
					</TRPCReactProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
