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
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

function VerifyEmailBanner({ email }: { email: string }) {
  const resend = useMutation({
    mutationFn: () => api("/auth/resend-verification", { method: "POST" }),
  });

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-amber-800 sm:px-6">
        <p>
          Please verify your email (<strong>{email}</strong>). You need it to accept invitations.
        </p>
        {resend.isSuccess ? (
          <span className="font-medium">Email sent. Check your inbox.</span>
        ) : (
          <Button
            variant="secondary"
            className="py-1 text-xs"
            loading={resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend email
          </Button>
        )}
      </div>
    </div>
  );
}
