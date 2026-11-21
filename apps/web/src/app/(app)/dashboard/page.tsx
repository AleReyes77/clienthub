"use client";

import { createOrganizationSchema, type OrganizationDto } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  PageLoader,
} from "@/components/ui";
import { api } from "@/lib/api";
import { roleLabels } from "@/lib/format";
import { type FieldErrors, formValues, validate } from "@/lib/forms";
import { keys, useOrganizations } from "@/lib/queries";

export default function DashboardPage() {
  const { data: organizations, isPending, error } = useOrganizations();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Your workspaces</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each workspace has its own team, clients and projects.
        </p>
      </div>

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage error={error} />
      ) : organizations.length === 0 ? (
        <EmptyState title="You are not part of any workspace yet">
          Create one below, or ask someone to invite you.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <li key={org.id}>
              <Link href={`/orgs/${org.id}`} className="block">
                <Card className="p-5 transition hover:ring-brand-500">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{org.name}</h2>
                    <Badge tone={org.role === "CLIENT" ? "violet" : "blue"}>
                      {roleLabels[org.role]}
                    </Badge>
                  </div>
                  <p className="mt-6 text-sm font-medium text-brand-600">Open workspace →</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateOrganizationForm />
    </div>
  );
}

function CreateOrganizationForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const create = useMutation({
    mutationFn: (input: { name: string }) =>
      api<{ organization: OrganizationDto }>("/orgs", { method: "POST", body: input }),
    onSuccess: ({ organization }) => {
      queryClient.invalidateQueries({ queryKey: keys.orgs });
      router.push(`/orgs/${organization.id}`);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(createOrganizationSchema, formValues(event.currentTarget));
    setErrors(result.errors ?? {});
    if (result.data) create.mutate(result.data);
  }

  return (
    <Card className="max-w-lg p-5">
      <h2 className="font-semibold">Create a workspace</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
        <Field label="Workspace name" htmlFor="org-name" error={errors.name}>
          <Input id="org-name" name="name" placeholder="e.g. Northwind Studio" />
        </Field>
        <ErrorMessage error={create.error} />
        <Button type="submit" loading={create.isPending}>
          Create workspace
        </Button>
      </form>
    </Card>
  );
}
