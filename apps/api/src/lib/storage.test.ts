import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStorage, createS3Storage, newStorageKey, type Storage } from "./storage.js";

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

/** The same contract must hold for every storage adapter. */
function storageContract(name: string, getStorage: () => Storage) {
  describe(name, () => {
    it("stores, reads and deletes an object", async () => {
      const storage = getStorage();
      const key = newStorageKey("test");
      await storage.put(key, Buffer.from("hello"), "text/plain");
      expect(await readAll(await storage.get(key))).toBe("hello");

      await storage.delete(key);
      await expect(storage.get(key)).rejects.toMatchObject({ status: 404 });
    });

    it("rejects keys that try to escape the storage root", async () => {
      const storage = getStorage();
      await expect(storage.put("../outside", Buffer.from("x"), "text/plain")).rejects.toThrow();
      await expect(storage.get("/etc/passwd")).rejects.toThrow();
    });
  });
}

const localDir = mkdtempSync(path.join(tmpdir(), "clienthub-storage-"));
afterAll(() => rm(localDir, { recursive: true, force: true }));
storageContract("local storage", () => createLocalStorage(localDir));

/** Runs against any S3-compatible server when S3 settings are present (CI runs S3Mock). */
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
describe.skipIf(!s3Endpoint)("S3 storage (integration)", () => {
  const bucket = "clienthub-test";
  const credentials = { accessKeyId: "test", secretAccessKey: "test" };

  beforeAll(async () => {
    const client = new S3Client({
      region: "us-east-1",
      endpoint: s3Endpoint,
      forcePathStyle: true,
      credentials,
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") throw error;
    }
  });

  storageContract("S3 adapter", () =>
    createS3Storage({
      bucket,
      region: "us-east-1",
      endpoint: s3Endpoint,
      forcePathStyle: true,
      ...credentials,
    }),
  );
});
