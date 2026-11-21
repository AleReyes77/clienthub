"use client";

import { can } from "@clienthub/shared";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, ErrorMessage, PageLoader } from "@/components/ui";
import { roleLabels } from "@/lib/format";
import { useOrganization } from "@/lib/queries";

export default function OrganizationLayout({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const pathname = usePathname();
  const { data: org, isPending, error } = useOrganization(orgId);

  if (isPending) return <PageLoader />;
  if (error) return <ErrorMessage error={error} />;

  const tabs = [
    { href: `/orgs/${orgId}`, label: "Projects", show: true },
    { href: `/orgs/${orgId}/members`, label: "Members", show: can(org.role, "members:read") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
          ← All workspaces
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <Badge tone={org.role === "CLIENT" ? "violet" : "blue"}>{roleLabels[org.role]}</Badge>
        </div>
        <nav className="mt-4 flex gap-1 border-b border-slate-200" aria-label="Workspace sections">
          {tabs
            .filter((tab) => tab.show)
            .map((tab) => {
              const active =
                tab.href === `/orgs/${orgId}`
                  ? pathname === tab.href || pathname.startsWith(`${tab.href}/projects`)
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                    active
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
        </nav>
      </div>
      {children}
    </div>
  );
}
