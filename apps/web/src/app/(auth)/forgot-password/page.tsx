"use client";

import { forgotPasswordSchema } from "@clienthub/shared";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { type FieldErrors, formValues, validate } from "@/lib/forms";

export default function ForgotPasswordPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const request = useMutation({
    mutationFn: (input: { email: string }) =>
      api("/auth/forgot-password", { method: "POST", body: input }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(forgotPasswordSchema, formValues(event.currentTarget));
    setErrors(result.errors ?? {});
    if (result.data) request.mutate(result.data);
  }

  if (request.isSuccess) {
    return (
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          If an account exists for that address, we sent a link to reset the password. The link
          expires in 1 hour.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600">
          ← Back to log in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your email and we will send you a link to choose a new password.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <ErrorMessage error={request.error} />
        <Button type="submit" className="w-full" loading={request.isPending}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-slate-500 hover:text-slate-700">
          ← Back to log in
        </Link>
      </p>
    </Card>
  );
}
