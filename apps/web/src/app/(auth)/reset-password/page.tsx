"use client";

import { resetPasswordSchema } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorMessage, Field, Input, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { type FieldErrors, formValues, serverFieldErrors, validate } from "@/lib/forms";
import { useHashToken } from "@/lib/use-hash-token";

export default function ResetPasswordPage() {
  const token = useHashToken();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const reset = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api("/auth/reset-password", { method: "POST", body: input }),
    // Every session was closed by the API, including this browser's.
    onSuccess: () => queryClient.clear(),
    onError: (error) => setErrors(serverFieldErrors(error)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    if (values.password !== values.confirm) {
      setErrors({ confirm: "The passwords do not match" });
      return;
    }
    const result = validate(resetPasswordSchema, { token, password: values.password });
    setErrors(result.errors ?? {});
    if (result.data) reset.mutate(result.data);
  }

  if (token === undefined) return <PageLoader />;

  if (!token) {
    return (
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Invalid link</h1>
        <p className="mt-2 text-sm text-slate-600">Open the link from the email again.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm text-brand-600">
          Request a new link
        </Link>
      </Card>
    );
  }

  if (reset.isSuccess) {
    return (
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Password changed</h1>
        <p className="mt-2 text-sm text-slate-600">
          For your security we logged you out on every device. Log in with your new password.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Log in
        </Link>
      </Card>
    );
  }

  const tokenError = errors.token;

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field
          label="New password"
          htmlFor="password"
          error={errors.password}
          hint="At least 12 characters."
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" />
        </Field>
        <Field label="Repeat the password" htmlFor="confirm" error={errors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
        </Field>
        {tokenError && <ErrorMessage error={new Error(tokenError)} />}
        {reset.error && Object.keys(serverFieldErrors(reset.error)).length === 0 && (
          <ErrorMessage error={reset.error} />
        )}
        <Button type="submit" className="w-full" loading={reset.isPending}>
          Change password
        </Button>
      </form>
      {reset.error && (
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="text-brand-600 hover:underline">
            Request a new link
          </Link>
        </p>
      )}
    </Card>
  );
}
