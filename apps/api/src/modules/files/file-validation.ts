import { fileTypeFromBuffer } from "file-type";

/**
 * Allowed binary formats, identified by their magic bytes (file signature),
 * never by the extension or the Content-Type sent by the browser, which the
 * uploader controls.
 */
const ALLOWED_BINARY_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Plain-text formats have no signature, so they are checked by extension + valid UTF-8. */
const TEXT_TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

export const ALLOWED_FILES_DESCRIPTION =
  "Images (PNG, JPEG, WebP, GIF), PDF, ZIP, Word, Excel, PowerPoint, TXT, CSV and Markdown";

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the content type to store, or null if the file is not allowed.
 * HTML and SVG are never accepted: served from our origin they could run scripts (stored XSS).
 */
export async function detectContentType(buffer: Buffer, filename: string): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) return ALLOWED_BINARY_TYPES.has(detected.mime) ? detected.mime : null;

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const textType = TEXT_TYPES[extension];
  return textType && isUtf8Text(buffer) ? textType : null;
}

/** Keeps the original name for display only; it is never used as a path. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters on purpose
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}
