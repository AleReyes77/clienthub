import type { ProjectStatus } from "@clienthub/shared";
import { projectStatusLabels } from "@/lib/format";
import { Badge } from "./ui";

const tones = {
  ACTIVE: "green",
  ON_HOLD: "amber",
  COMPLETED: "blue",
  ARCHIVED: "slate",
} as const satisfies Record<ProjectStatus, string>;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={tones[status]}>{projectStatusLabels[status]}</Badge>;
}
