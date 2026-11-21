"use client";

import { can, type OrganizationDto, type ProjectFileDto } from "@clienthub/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useRef, useState } from "react";
import { api, apiUpload } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { keys, useFiles } from "@/lib/queries";
import { Button, Card, ErrorMessage, PageLoader } from "./ui";

/** Keep in sync with MAX_UPLOAD_MB on the API (the API enforces the real limit). */
const MAX_UPLOAD_MB = 10;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.docx,.xlsx,.pptx,.txt,.csv,.md";

export function ProjectFiles({ org, projectId }: { org: OrganizationDto; projectId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const files = useFiles(org.id, projectId);
  const basePath = `/orgs/${org.id}/projects/${projectId}/files`;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.files(org.id, projectId) });

  const upload = useMutation({
    mutationFn: (file: File) => apiUpload<{ file: ProjectFileDto }>(basePath, file),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => api(`${basePath}/${fileId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setClientError(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setClientError(`The file is larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    upload.mutate(file);
  }

  const canDelete = (file: ProjectFileDto) =>
    can(org.role, "files:deleteAny") || file.uploadedBy?.membershipId === org.membershipId;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-semibold">Files</h3>
          <p className="text-xs text-slate-500">
            Images, PDF, Office documents, ZIP, TXT and CSV up to {MAX_UPLOAD_MB} MB.
          </p>
        </div>
        {can(org.role, "files:upload") && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              id="file-upload"
              onChange={onFileChosen}
            />
            <Button
              variant="secondary"
              loading={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              Upload file
            </Button>
          </>
        )}
      </div>

      <div className="px-5 py-2">
        {(clientError || upload.error || remove.error) && (
          <div className="py-2">
            <ErrorMessage
              error={clientError ? new Error(clientError) : (upload.error ?? remove.error)}
            />
          </div>
        )}

        {files.isPending ? (
          <PageLoader />
        ) : files.error ? (
          <ErrorMessage error={files.error} />
        ) : files.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No files yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.data.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <a
                    href={`/api/v1${basePath}/${file.id}/download`}
                    className="block truncate font-medium text-brand-700 hover:underline"
                  >
                    {file.name}
                  </a>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} · {file.uploadedBy?.name ?? "Former member"} ·{" "}
                    {formatDate(file.createdAt)}
                  </p>
                </div>
                {canDelete(file) && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    loading={remove.isPending && remove.variables === file.id}
                    onClick={() => {
                      if (window.confirm(`Delete "${file.name}"?`)) remove.mutate(file.id);
                    }}
                    aria-label={`Delete ${file.name}`}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
