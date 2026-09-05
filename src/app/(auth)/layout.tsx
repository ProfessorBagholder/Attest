import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth-next";
import { Logo } from "@/components/ui";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-10">
      <Logo className="mb-10 self-start text-lg" />
      {children}
    </div>
  );
}
