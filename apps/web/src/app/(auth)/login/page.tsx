"use client";

import { loginSchema, type UserDto } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { safeRedirect } from "@/lib/format";
import { type FieldErrors, formValues, validate } from "@/lib/forms";
import { keys } from "@/lib/queries";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirect(searchParams.get("next"));
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<{ user: UserDto }>("/auth/login", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, user);
      router.replace(next);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(loginSchema, formValues(event.currentTarget));
    setErrors(result.errors ?? {});
    if (result.data) login.mutate(result.data);
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back to your workspace.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        <ErrorMessage error={login.error} />
        <Button type="submit" className="w-full" loading={login.isPending}>
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        No account yet?{" "}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-600 hover:underline"
        >
          Create one
        </Link>
      </p>
    </Card>
  );
}
