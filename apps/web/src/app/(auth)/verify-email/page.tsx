"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Card, ErrorMessage, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";
import { useHashToken } from "@/lib/use-hash-token";

export default function VerifyEmailPage() {
  const token = useHashToken();
  const queryClient = useQueryClient();

  const verify = useMutation({
    mutationFn: (value: string) =>
      api("/auth/verify-email", { method: "POST", body: { token: value } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
  const { mutate } = verify;
  // Tokens are single-use: never send the same one twice (React runs effects twice in dev).
  const sent = useRef(false);

  // Verifying only marks the address as confirmed, so it can run on page load.
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      mutate(token);
    }
  }, [token, mutate]);

  if (token === undefined || verify.isPending || (token && verify.isIdle)) {
    return <PageLoader />;
  }

  return (
    <Card className="p-6 sm:p-8">
      {verify.isSuccess ? (
        <>
          <h1 className="text-xl font-semibold">Email verified</h1>
          <p className="mt-2 text-sm text-slate-600">Thanks! Your email address is confirmed.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">We could not verify your email</h1>
          <div className="mt-4">
            <ErrorMessage error={verify.error ?? new Error("This link is not valid.")} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Log in and use “Resend email” to get a new link.
          </p>
        </>
      )}
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Go to your workspaces
      </Link>
    </Card>
  );
}
