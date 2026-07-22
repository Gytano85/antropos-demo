import { AdminLayout } from "@/components/admin-layout";
import { AdminThemeApplier } from "@/components/admin-theme-applier";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth-guard";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
	const currentUser = await getAuthUser();
	if (!currentUser) redirect("/login");
	if (!currentUser.branchId) redirect("/branches");
  return (
    <>
      <AdminThemeApplier />
      <AdminLayout>{children}</AdminLayout>
    </>
  );
}
