import { requireUser } from "@/lib/auth-next";
import { AppNav } from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
