"use client";

import {
  type CreatedInvitationDto,
  can,
  canManageMember,
  createInvitationSchema,
  INVITABLE_ROLES,
  type MemberDto,
  type OrganizationDto,
  ROLES,
  type Role,
} from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
  PageLoader,
  Select,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, roleLabels } from "@/lib/format";
import { type FieldErrors, formValues, validate } from "@/lib/forms";
import { keys, useInvitations, useMembers, useOrganization } from "@/lib/queries";

export default function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org } = useOrganization(orgId);
  const canRead = org ? can(org.role, "members:read") : false;
  const canManage = org ? can(org.role, "members:manage") : false;
  const members = useMembers(orgId, canRead);

  if (!org || (canRead && members.isPending)) return <PageLoader />;
  if (!canRead) return <ErrorMessage error={new Error("You do not have access to this page.")} />;
  if (members.error) return <ErrorMessage error={members.error} />;

  return (
    <div className="space-y-8">
      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Members</h2>
          <p className="text-sm text-slate-500">{members.data?.length ?? 0} people</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {members.data?.map((member) => (
            <MemberRow key={member.membershipId} org={org} member={member} orgId={orgId} />
          ))}
        </ul>
      </Card>

      {canManage && <Invitations orgId={orgId} />}
    </div>
  );
}

function MemberRow({
  org,
  member,
  orgId,
}: {
  org: OrganizationDto;
  member: MemberDto;
  orgId: string;
}) {
  const queryClient = useQueryClient();
  const path = `/orgs/${orgId}/members/${member.membershipId}`;
  const manageable = canManageMember({
    actorRole: org.role,
    actorMembershipId: org.membershipId,
    targetRole: member.role,
    targetMembershipId: member.membershipId,
  });
  // Only owners can make someone an owner.
  const roleOptions = ROLES.filter((r) => org.role === "OWNER" || r !== "OWNER");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.members(orgId) });
  const updateRole = useMutation({
    mutationFn: (role: Role) => api(path, { method: "PATCH", body: { role } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api(path, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const isYou = member.membershipId === org.membershipId;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {member.user.name} {isYou && <span className="text-sm text-slate-400">(you)</span>}
        </p>
        <p className="truncate text-sm text-slate-500">{member.user.email}</p>
        <ErrorMessage error={updateRole.error ?? remove.error} />
      </div>
      {manageable ? (
        <div className="flex items-center gap-2">
          <label htmlFor={`role-${member.membershipId}`} className="sr-only">
            Role of {member.user.name}
          </label>
          <Select
            id={`role-${member.membershipId}`}
            value={member.role}
            onChange={(e) => updateRole.mutate(e.target.value as Role)}
            disabled={updateRole.isPending}
            className="w-auto"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${member.user.name} from ${org.name}?`)) remove.mutate();
            }}
          >
            Remove
          </Button>
        </div>
      ) : (
        <Badge tone={member.role === "CLIENT" ? "violet" : "blue"}>{roleLabels[member.role]}</Badge>
      )}
    </li>
  );
}

function Invitations({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const invitations = useInvitations(orgId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedInvitationDto | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: (body: unknown) =>
      api<{ invitation: CreatedInvitationDto }>(`/orgs/${orgId}/invitations`, {
        method: "POST",
        body,
      }),
    onSuccess: ({ invitation }) => {
      setCreated(invitation);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: keys.invitations(orgId) });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/orgs/${orgId}/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validate(createInvitationSchema, formValues(form));
    setErrors(result.errors ?? {});
    if (result.data) invite.mutate(result.data, { onSuccess: () => form.reset() });
  }

  const inviteLink = created ? `${window.location.origin}/invite/${created.token}` : "";

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Invite people</h2>
      <p className="mt-1 text-sm text-slate-500">
        Share the invitation link with the person. It works only for their email and expires in 7
        days.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-56 flex-1">
          <Field label="Email" htmlFor="invite-email" error={errors.email}>
            <Input id="invite-email" name="email" type="email" placeholder="name@company.com" />
          </Field>
        </div>
        <Field label="Role" htmlFor="invite-role" error={errors.role}>
          <Select id="invite-role" name="role" defaultValue="MEMBER" className="w-auto">
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={invite.isPending}>
          Create invitation
        </Button>
      </form>
      <div className="mt-3">
        <ErrorMessage error={invite.error} />
      </div>

      {created && (
        <div className="mt-4 rounded-lg bg-brand-50 p-4 text-sm">
          <p className="font-medium text-brand-700">Invitation created for {created.email}</p>
          <p className="mt-1 text-slate-600">
            Copy this link now. For security it is shown only once.
          </p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={inviteLink} aria-label="Invitation link" />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <h3 className="mt-8 text-sm font-semibold text-slate-700">Pending invitations</h3>
      {invitations.isPending ? (
        <PageLoader />
      ) : invitations.data && invitations.data.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {invitations.data.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <div className="text-sm">
                <span className="font-medium">{invitation.email}</span>{" "}
                <Badge>{roleLabels[invitation.role]}</Badge>
                <span className="ml-2 text-slate-500">
                  expires {formatDate(invitation.expiresAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => revoke.mutate(invitation.id)}
                loading={revoke.isPending && revoke.variables === invitation.id}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No pending invitations.</p>
      )}
    </Card>
  );
}
