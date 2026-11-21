import type { Role } from "@clienthub/shared";
import type { EmailMessage } from "../../lib/mailer.js";
import type { JobQueue } from "../../lib/queue.js";
import * as templates from "./templates.js";

const roleLabels: Record<Role, string> = {
  OWNER: "an owner",
  ADMIN: "an admin",
  MEMBER: "a team member",
  CLIENT: "a client",
};

/**
 * Builds emails and puts them on the job queue, so a slow or failing mail
 * server never slows down or breaks the request that triggered the email.
 *
 * Links that carry a secret token use the URL fragment (`#token=`): browsers never send
 * the fragment to servers, so the token does not end up in access logs or Referer headers.
 */
export function createNotifier(queue: JobQueue, webOrigin: string) {
  const send = (message: EmailMessage) => queue.enqueue("email.send", message);

  return {
    verifyEmail(user: { email: string; name: string }, token: string) {
      const url = `${webOrigin}/verify-email#token=${encodeURIComponent(token)}`;
      return send(templates.verifyEmailMessage(user.email, user.name, url));
    },

    passwordReset(user: { email: string; name: string }, token: string) {
      const url = `${webOrigin}/reset-password#token=${encodeURIComponent(token)}`;
      return send(templates.passwordResetMessage(user.email, user.name, url));
    },

    passwordChanged(user: { email: string; name: string }) {
      return send(templates.passwordChangedMessage(user.email, user.name));
    },

    invitation(params: {
      email: string;
      role: Role;
      organizationName: string;
      inviterName: string;
      token: string;
    }) {
      return send(
        templates.invitationMessage({
          to: params.email,
          organizationName: params.organizationName,
          inviterName: params.inviterName,
          roleLabel: roleLabels[params.role],
          url: `${webOrigin}/invite/${encodeURIComponent(params.token)}`,
        }),
      );
    },

    taskAssigned(params: {
      email: string;
      assigneeName: string;
      assignerName: string;
      taskTitle: string;
      projectName: string;
      organizationId: string;
      projectId: string;
    }) {
      return send(
        templates.taskAssignedMessage({
          to: params.email,
          assigneeName: params.assigneeName,
          assignerName: params.assignerName,
          taskTitle: params.taskTitle,
          projectName: params.projectName,
          url: `${webOrigin}/orgs/${params.organizationId}/projects/${params.projectId}`,
        }),
      );
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
