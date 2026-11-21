import { can, type ProjectFileDto } from "@clienthub/shared";
import { AppError, badRequest, forbidden, notFound } from "../../lib/errors.js";
import type { Prisma, PrismaClient } from "../../lib/prisma.js";
import { newStorageKey, type Storage } from "../../lib/storage.js";
import { createProjectsService, type MembershipContext } from "../projects/projects.service.js";
import {
  ALLOWED_FILES_DESCRIPTION,
  detectContentType,
  sanitizeFilename,
} from "./file-validation.js";

const fileSelect = {
  id: true,
  name: true,
  contentType: true,
  size: true,
  storageKey: true,
  createdAt: true,
  uploadedByMembershipId: true,
  uploadedBy: { select: { id: true, user: { select: { name: true } } } },
} as const satisfies Prisma.ProjectFileSelect;

type FileRow = Prisma.ProjectFileGetPayload<{ select: typeof fileSelect }>;

function toFileDto(file: FileRow): ProjectFileDto {
  return {
    id: file.id,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    uploadedBy: file.uploadedBy
      ? { membershipId: file.uploadedBy.id, name: file.uploadedBy.user.name }
      : null,
    createdAt: file.createdAt.toISOString(),
  };
}

export function createFilesService(prisma: PrismaClient, storage: Storage) {
  const projects = createProjectsService(prisma);

  /** Files are only reachable through a project the member can see (no IDOR). */
  async function findFile(membership: MembershipContext, projectId: string, fileId: string) {
    await projects.findVisible(membership, projectId);
    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, projectId },
      select: fileSelect,
    });
    if (!file) throw notFound("File");
    return file;
  }

  return {
    async list(membership: MembershipContext, projectId: string): Promise<ProjectFileDto[]> {
      await projects.findVisible(membership, projectId);
      const files = await prisma.projectFile.findMany({
        where: { projectId },
        select: fileSelect,
        orderBy: { createdAt: "desc" },
      });
      return files.map(toFileDto);
    },

    async upload(
      membership: MembershipContext,
      projectId: string,
      upload: { originalName: string; buffer: Buffer },
    ): Promise<ProjectFileDto> {
      await projects.findVisible(membership, projectId);
      if (upload.buffer.length === 0) throw badRequest("EMPTY_FILE", "The file is empty");

      const name = sanitizeFilename(upload.originalName);
      const contentType = await detectContentType(upload.buffer, name);
      if (!contentType) {
        throw new AppError(
          415,
          "UNSUPPORTED_FILE_TYPE",
          `This file type is not allowed. Allowed: ${ALLOWED_FILES_DESCRIPTION}.`,
        );
      }

      const storageKey = newStorageKey(`projects/${projectId}`);
      await storage.put(storageKey, upload.buffer, contentType);
      try {
        const file = await prisma.projectFile.create({
          data: {
            projectId,
            uploadedByMembershipId: membership.id,
            name,
            storageKey,
            contentType,
            size: upload.buffer.length,
          },
          select: fileSelect,
        });
        return toFileDto(file);
      } catch (error) {
        // Do not leave orphaned bytes in storage if the database write fails.
        await storage.delete(storageKey);
        throw error;
      }
    },

    async download(membership: MembershipContext, projectId: string, fileId: string) {
      const file = await findFile(membership, projectId, fileId);
      return { file, stream: await storage.get(file.storageKey) };
    },

    /** Anyone can delete their own uploads; owners and admins can delete any file. */
    async remove(membership: MembershipContext, projectId: string, fileId: string) {
      const file = await findFile(membership, projectId, fileId);
      const isUploader = file.uploadedByMembershipId === membership.id;
      if (!isUploader && !can(membership.role, "files:deleteAny")) {
        throw forbidden("You can only delete files you uploaded");
      }
      await prisma.projectFile.delete({ where: { id: file.id } });
      return { name: file.name, storageKey: file.storageKey };
    },
  };
}
