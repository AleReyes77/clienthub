"use client";

import { registerSchema, type UserDto } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { safeRedirect } from "@/lib/format";
import { type FieldErrors, formValues, serverFieldErrors, validate } from "@/lib/forms";
import { keys } from "@/lib/queries";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirect(searchParams.get("next"));
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const register = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      api<{ user: UserDto }>("/auth/register", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, user);
      router.replace(next);
    },
    onError: (error) => setErrors(serverFieldErrors(error)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(registerSchema, formValues(event.currentTarget));
    setErrors(result.errors ?? {});
    if (result.data) register.mutate(result.data);
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Start organizing your client work.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
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
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password}
          hint="At least 12 characters. A short phrase is easier to remember."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        {register.error && Object.keys(serverFieldErrors(register.error)).length === 0 && (
          <ErrorMessage error={register.error} />
        )}
        <Button type="submit" className="w-full" loading={register.isPending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-600 hover:underline"
        >
          Log in
        </Link>
      </p>
    </Card>
  );
}
