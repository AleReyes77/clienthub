import { pipeline } from "node:stream/promises";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import type { Config } from "../../config.js";
import { badRequest } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { JobQueue } from "../../lib/queue.js";
import type { Storage } from "../../lib/storage.js";
import { authorize, getMembership } from "../../middleware/membership.js";
import type { AuditService } from "../audit/audit.service.js";
import { createFilesService } from "./files.service.js";

/** Mounted under `/orgs/:orgId`. */
export function filesRouter(deps: {
  prisma: PrismaClient;
  config: Config;
  storage: Storage;
  queue: JobQueue;
  audit: AuditService;
}) {
  const { audit, queue } = deps;
  const router = Router();
  const files = createFilesService(deps.prisma, deps.storage);

  const parseSingleFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.config.maxUploadBytes, files: 1, fields: 0, parts: 1 },
    defParamCharset: "utf8",
  }).single("file");

  /**
   * Parses the multipart body only after the permission and project checks,
   * so users without access cannot make the server buffer large uploads.
   */
  function readUpload(req: Request, res: Response): Promise<Express.Multer.File> {
    return new Promise((resolve, reject) => {
      parseSingleFile(req, res, (err: unknown) => {
        if (err) return reject(err);
        if (!req.file) return reject(badRequest("NO_FILE", "Attach a file in the `file` field"));
        resolve(req.file);
      });
    });
  }

  router.get("/projects/:projectId/files", async (req, res) => {
    res.json({ files: await files.list(getMembership(req), req.params.projectId) });
  });

  router.post("/projects/:projectId/files", async (req, res) => {
    const membership = authorize(req, "files:upload");
    // Fail fast (404) before reading the body if the project is not visible.
    await files.list(membership, req.params.projectId);
    const upload = await readUpload(req, res);

    const file = await files.upload(membership, req.params.projectId, {
      originalName: upload.originalname,
      buffer: upload.buffer,
    });
    await audit.recordFromRequest(req, {
      action: "file.uploaded",
      targetType: "file",
      targetId: file.id,
      metadata: { name: file.name, size: file.size, projectId: req.params.projectId },
    });
    res.status(201).json({ file });
  });

  router.get("/projects/:projectId/files/:fileId/download", async (req, res) => {
    const { projectId, fileId } = req.params;
    const { file, stream } = await files.download(getMembership(req), projectId, fileId);

    // Always download, never render: an uploaded file must not run in our origin.
    res.attachment(file.name);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "private, no-store");
    await pipeline(stream, res);
  });

  router.delete("/projects/:projectId/files/:fileId", async (req, res) => {
    const { projectId, fileId } = req.params;
    const removed = await files.remove(getMembership(req), projectId, fileId);
    await queue.enqueue("storage.delete", { keys: [removed.storageKey] });
    await audit.recordFromRequest(req, {
      action: "file.deleted",
      targetType: "file",
      targetId: fileId,
      metadata: { name: removed.name, projectId },
    });
    res.status(204).end();
  });

  return router;
}
