"use client";

import type { InvitableRole, OrganizationDto } from "@clienthub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button, Card, ErrorMessage, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { roleLabels } from "@/lib/format";
import { keys, useMe } from "@/lib/queries";

interface InvitationPreview {
  organizationName: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: async () =>
      (await api<{ invitation: InvitationPreview }>(`/invitations/${token}`)).invitation,
  });

  const accept = useMutation({
    mutationFn: () =>
      api<{ organization: OrganizationDto }>(`/invitations/${token}/accept`, { method: "POST" }),
    onSuccess: ({ organization }) => {
      queryClient.invalidateQueries({ queryKey: keys.orgs });
      router.push(`/orgs/${organization.id}`);
    },
  });

  const next = encodeURIComponent(`/invite/${token}`);
  const user = me.data;
  const inv = invitation.data;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md p-6 sm:p-8">
        {invitation.isPending || me.isPending ? (
          <PageLoader />
        ) : invitation.error ? (
          <>
            <h1 className="text-xl font-semibold">Invitation not available</h1>
            <div className="mt-4">
              <ErrorMessage error={invitation.error} />
            </div>
          </>
        ) : inv ? (
          <>
            <h1 className="text-xl font-semibold">Join {inv.organizationName}</h1>
            <p className="mt-2 text-sm text-slate-600">
              You were invited as <strong>{roleLabels[inv.role]}</strong> with the email{" "}
              <strong>{inv.email}</strong>.
            </p>

            <div className="mt-6 space-y-3">
              {!user ? (
                <>
                  <p className="text-sm text-slate-600">
                    Log in or create an account with that email to accept.
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href={`/register?next=${next}`}
                      className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Create account
                    </Link>
                    <Link
                      href={`/login?next=${next}`}
                      className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Log in
                    </Link>
                  </div>
                </>
              ) : user.email !== inv.email ? (
                <ErrorMessage
                  error={
                    new Error(
                      `You are logged in as ${user.email}. Log in with ${inv.email} to accept this invitation.`,
                    )
                  }
                />
              ) : (
                <>
                  <Button onClick={() => accept.mutate()} loading={accept.isPending}>
                    Accept invitation
                  </Button>
                  <ErrorMessage error={accept.error} />
                </>
              )}
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
