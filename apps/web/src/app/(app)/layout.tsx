"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { Logo } from "@/components/logo";
import { Button, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";

/**
 * Layout for signed-in pages. The API enforces authentication on every request;
 * this guard only redirects to the login page for a better experience.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isPending } = useMe();
  // After an explicit logout, do not send the next person back to this page.
  const loggingOut = useRef(false);

  useEffect(() => {
    if (!isPending && user === null) {
      router.replace(loggingOut.current ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isPending, user, pathname, router]);

  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onMutate: () => {
      loggingOut.current = true;
    },
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  if (!user) return <PageLoader />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
            <Button variant="ghost" onClick={() => logout.mutate()} loading={logout.isPending}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
