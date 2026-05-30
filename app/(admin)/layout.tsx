import AdminLayout from "@/components/AdminLayout";
import { isAuthDisabled } from "@/lib/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLayout authEnabled={!isAuthDisabled()}>
      {children}
    </AdminLayout>
  );
}
