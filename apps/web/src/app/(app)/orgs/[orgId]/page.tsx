"use client";

import { can, createProjectSchema, type ProjectDto } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  PageLoader,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { type FieldErrors, formValues, validate } from "@/lib/forms";
import { keys, membersWithRole, useMembers, useOrganization, useProjects } from "@/lib/queries";

export default function ProjectsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org } = useOrganization(orgId);
  const { data: projects, isPending, error } = useProjects(orgId);
  const [showForm, setShowForm] = useState(false);

  const canCreate = org ? can(org.role, "projects:create") : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        {canCreate && !showForm && <Button onClick={() => setShowForm(true)}>New project</Button>}
      </div>

      {showForm && <CreateProjectForm orgId={orgId} onDone={() => setShowForm(false)} />}

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage error={error} />
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet">
          {canCreate
            ? "Create your first project to start tracking work."
            : "Projects shared with you will appear here."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard orgId={orgId} project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ orgId, project }: { orgId: string; project: ProjectDto }) {
  const { TODO, IN_PROGRESS, DONE } = project.taskCounts;
  const total = TODO + IN_PROGRESS + DONE;
  const progress = total === 0 ? 0 : Math.round((DONE / total) * 100);

  return (
    <Link href={`/orgs/${orgId}/projects/${project.id}`} className="block h-full">
      <Card className="flex h-full flex-col p-5 transition hover:ring-brand-500">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{project.name}</h3>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p>
        )}
        <div className="mt-auto pt-5">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{project.client ? `Client: ${project.client.name}` : "Internal"}</span>
            <span>
              {DONE}/{total} tasks done
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progress}% of tasks done`}
          >
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function CreateProjectForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: members } = useMembers(orgId);
  const clients = membersWithRole(members, ["CLIENT"]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const create = useMutation({
    mutationFn: (input: unknown) =>
      api<{ project: ProjectDto }>(`/orgs/${orgId}/projects`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects(orgId) });
      onDone();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = validate(createProjectSchema, {
      ...values,
      clientMembershipId: values.clientMembershipId || undefined,
    });
    setErrors(result.errors ?? {});
    if (result.data) create.mutate(result.data);
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold">New project</h3>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" htmlFor="project-name" error={errors.name}>
          <Input id="project-name" name="name" placeholder="e.g. Website redesign" />
        </Field>
        <Field
          label="Client"
          htmlFor="project-client"
          error={errors.clientMembershipId}
          hint={
            clients.length === 0 ? "Invite a client from the Members tab to assign one." : undefined
          }
        >
          <Select id="project-client" name="clientMembershipId" defaultValue="">
            <option value="">No client (internal project)</option>
            {clients.map((client) => (
              <option key={client.membershipId} value={client.membershipId}>
                {client.user.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="project-description" error={errors.description}>
            <Textarea id="project-description" name="description" />
          </Field>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={create.isPending}>
            Create project
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
        <div className="sm:col-span-2">
          <ErrorMessage error={create.error} />
        </div>
      </form>
    </Card>
  );
}
