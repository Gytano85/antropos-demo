import { AdminLayout } from "@/components/admin-layout";
import { AdminThemeApplier } from "@/components/admin-theme-applier";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <AdminThemeApplier />
      <AdminLayout>{children}</AdminLayout>
    </>
  );
}
