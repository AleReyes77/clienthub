"use client";

import {
  can,
  createTaskSchema,
  PROJECT_STATUSES,
  type ProjectStatus,
  type Role,
  TASK_STATUSES,
  type TaskDto,
  type TaskStatus,
} from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ProjectFiles } from "@/components/project-files";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import {
  Badge,
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
  PageLoader,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, isOverdue, projectStatusLabels, taskStatusLabels } from "@/lib/format";
import { type FieldErrors, formValues, validate } from "@/lib/forms";
import {
  keys,
  membersWithRole,
  useMembers,
  useOrganization,
  useProject,
  useTasks,
} from "@/lib/queries";

export default function ProjectPage() {
  const { orgId, projectId } = useParams<{ orgId: string; projectId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: org } = useOrganization(orgId);
  const project = useProject(orgId, projectId);
  const tasks = useTasks(orgId, projectId);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const role: Role = org?.role ?? "CLIENT";
  const canEditProject = can(role, "projects:update");

  const updateProject = useMutation({
    mutationFn: (body: { status: ProjectStatus }) =>
      api(`/orgs/${orgId}/projects/${projectId}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.project(orgId, projectId) });
      queryClient.invalidateQueries({ queryKey: keys.projects(orgId) });
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects(orgId) });
      router.push(`/orgs/${orgId}`);
    },
  });

  if (project.isPending) return <PageLoader />;
  if (project.error) return <ErrorMessage error={project.error} />;

  const p = project.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/orgs/${orgId}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← Projects
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <ProjectStatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {p.client ? `Client: ${p.client.name}` : "Internal project"}
          </p>
          {p.description && <p className="mt-3 max-w-2xl text-slate-700">{p.description}</p>}
        </div>

        {canEditProject && (
          <div className="flex items-center gap-2">
            <label htmlFor="project-status" className="sr-only">
              Project status
            </label>
            <Select
              id="project-status"
              value={p.status}
              onChange={(e) => updateProject.mutate({ status: e.target.value as ProjectStatus })}
              className="w-auto"
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {projectStatusLabels[status]}
                </option>
              ))}
            </Select>
            {can(role, "projects:delete") && (
              <Button
                variant="danger"
                loading={deleteProject.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${p.name}" and all its tasks?`))
                    deleteProject.mutate();
                }}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
      <ErrorMessage error={updateProject.error ?? deleteProject.error} />

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tasks</h3>
        {can(role, "tasks:create") && !showTaskForm && (
          <Button onClick={() => setShowTaskForm(true)}>New task</Button>
        )}
      </div>

      {showTaskForm && (
        <CreateTaskForm orgId={orgId} projectId={projectId} onDone={() => setShowTaskForm(false)} />
      )}

      {tasks.isPending ? (
        <PageLoader />
      ) : tasks.error ? (
        <ErrorMessage error={tasks.error} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {TASK_STATUSES.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={tasks.data.filter((t) => t.status === status)}
              orgId={orgId}
              projectId={projectId}
              role={role}
            />
          ))}
        </div>
      )}

      {org && <ProjectFiles org={org} projectId={projectId} />}
    </div>
  );
}

function TaskColumn(props: {
  status: TaskStatus;
  tasks: TaskDto[];
  orgId: string;
  projectId: string;
  role: Role;
}) {
  return (
    <section className="rounded-xl bg-slate-100/70 p-3" aria-label={taskStatusLabels[props.status]}>
      <h4 className="flex items-center justify-between px-1 pb-3 text-sm font-medium text-slate-600">
        {taskStatusLabels[props.status]}
        <span className="text-xs text-slate-400">{props.tasks.length}</span>
      </h4>
      <ul className="space-y-2">
        {props.tasks.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} {...props} />
          </li>
        ))}
        {props.tasks.length === 0 && (
          <li className="px-1 py-4 text-center text-xs text-slate-400">No tasks</li>
        )}
      </ul>
    </section>
  );
}

function TaskCard({
  task,
  orgId,
  projectId,
  role,
}: {
  task: TaskDto;
  orgId: string;
  projectId: string;
  role: Role;
}) {
  const queryClient = useQueryClient();
  const path = `/orgs/${orgId}/projects/${projectId}/tasks/${task.id}`;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.tasks(orgId, projectId) });
    queryClient.invalidateQueries({ queryKey: keys.projects(orgId) });
    queryClient.invalidateQueries({ queryKey: keys.project(orgId, projectId) });
  };

  const update = useMutation({
    mutationFn: (body: { status: TaskStatus }) => api(path, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api(path, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <Card className="p-3">
      <p
        className={`text-sm font-medium ${task.status === "DONE" ? "text-slate-500 line-through" : ""}`}
      >
        {task.title}
      </p>
      {task.description && <p className="mt-1 text-xs text-slate-500">{task.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        {task.dueDate && (
          <Badge tone={overdue ? "red" : "slate"}>
            {overdue ? "Overdue · " : "Due "}
            {formatDate(task.dueDate)}
          </Badge>
        )}
        {task.assignee && <span>{task.assignee.name}</span>}
      </div>

      {can(role, "tasks:update") && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`status-${task.id}`} className="sr-only">
            Status of {task.title}
          </label>
          <Select
            id={`status-${task.id}`}
            value={task.status}
            onChange={(e) => update.mutate({ status: e.target.value as TaskStatus })}
            disabled={update.isPending}
            className="py-1 text-xs"
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {taskStatusLabels[status]}
              </option>
            ))}
          </Select>
          {can(role, "tasks:delete") && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
              aria-label={`Delete ${task.title}`}
            >
              Delete
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        <ErrorMessage error={update.error ?? remove.error} />
      </div>
    </Card>
  );
}

function CreateTaskForm({
  orgId,
  projectId,
  onDone,
}: {
  orgId: string;
  projectId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: members } = useMembers(orgId);
  const assignees = membersWithRole(members, ["OWNER", "ADMIN", "MEMBER"]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const create = useMutation({
    mutationFn: (body: unknown) =>
      api(`/orgs/${orgId}/projects/${projectId}/tasks`, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.tasks(orgId, projectId) });
      queryClient.invalidateQueries({ queryKey: keys.projects(orgId) });
      queryClient.invalidateQueries({ queryKey: keys.project(orgId, projectId) });
      onDone();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = validate(createTaskSchema, {
      ...values,
      assigneeMembershipId: values.assigneeMembershipId || undefined,
      dueDate: values.dueDate || undefined,
    });
    setErrors(result.errors ?? {});
    if (result.data) create.mutate(result.data);
  }

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <div className="sm:col-span-3">
          <Field label="Title" htmlFor="task-title" error={errors.title}>
            <Input id="task-title" name="title" placeholder="e.g. Design the pricing page" />
          </Field>
        </div>
        <Field label="Assignee" htmlFor="task-assignee" error={errors.assigneeMembershipId}>
          <Select id="task-assignee" name="assigneeMembershipId" defaultValue="">
            <option value="">Unassigned</option>
            {assignees.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.user.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="task-due" error={errors.dueDate}>
          <Input id="task-due" name="dueDate" type="date" />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Description" htmlFor="task-description" error={errors.description}>
            <Textarea id="task-description" name="description" rows={2} />
          </Field>
        </div>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" loading={create.isPending}>
            Add task
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
        <div className="sm:col-span-3">
          <ErrorMessage error={create.error} />
        </div>
      </form>
    </Card>
  );
}
