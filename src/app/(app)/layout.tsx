import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const modules = session?.modules ?? [];
  const isAdmin = session?.isAdmin ?? false;

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar modules={modules} isAdmin={isAdmin} name={session?.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav modules={modules} isAdmin={isAdmin} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
