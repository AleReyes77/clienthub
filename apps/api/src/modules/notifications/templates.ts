import type { EmailMessage } from "../../lib/mailer.js";

/**
 * Names and project titles come from users, so everything interpolated into
 * the HTML version is escaped to prevent HTML injection in emails.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface Layout {
  to: string;
  subject: string;
  /** Paragraphs of plain text (already safe for text, escaped for HTML here). */
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

function render({ to, subject, paragraphs, action, footer }: Layout): EmailMessage {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    ...(footer ? ["", footer] : []),
    "",
    "— ClientHub",
  ].join("\n\n");

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:600;font-size:18px">ClientHub</p>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${
  action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#4338ca;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#64748b">Or copy this link: ${escapeHtml(action.url)}</p>`
    : ""
}
${footer ? `<p style="font-size:12px;color:#64748b">${escapeHtml(footer)}</p>` : ""}
</body></html>`;

  return { to, subject, text, html };
}

export function verifyEmailMessage(to: string, name: string, url: string) {
  return render({
    to,
    subject: "Verify your email for ClientHub",
    paragraphs: [`Hi ${name},`, "Please confirm that this is your email address."],
    action: { label: "Verify email", url },
    footer: "The link expires in 24 hours. If you did not create an account, ignore this email.",
  });
}

export function passwordResetMessage(to: string, name: string, url: string) {
  return render({
    to,
    subject: "Reset your ClientHub password",
    paragraphs: [`Hi ${name},`, "Someone asked to reset the password of your account."],
    action: { label: "Choose a new password", url },
    footer:
      "The link expires in 1 hour and works once. If it was not you, ignore this email: your password stays the same.",
  });
}

export function passwordChangedMessage(to: string, name: string) {
  return render({
    to,
    subject: "Your ClientHub password was changed",
    paragraphs: [
      `Hi ${name},`,
      "The password of your account was just changed and every device was logged out.",
      "If this was not you, reset your password right away and contact your workspace owner.",
    ],
  });
}

export function invitationMessage(params: {
  to: string;
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  url: string;
}) {
  return render({
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.organizationName} on ClientHub`,
    paragraphs: [
      `${params.inviterName} invited you to join ${params.organizationName} as ${params.roleLabel}.`,
    ],
    action: { label: "Accept invitation", url: params.url },
    footer: "The invitation expires in 7 days and only works for this email address.",
  });
}

export function taskAssignedMessage(params: {
  to: string;
  assigneeName: string;
  assignerName: string;
  taskTitle: string;
  projectName: string;
  url: string;
}) {
  return render({
    to: params.to,
    subject: `New task: ${params.taskTitle}`,
    paragraphs: [
      `Hi ${params.assigneeName},`,
      `${params.assignerName} assigned you "${params.taskTitle}" in ${params.projectName}.`,
    ],
    action: { label: "Open project", url: params.url },
  });
}
