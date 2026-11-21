"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reads `#token=…` from the URL. Email links put secrets in the fragment because
 * browsers never send it to any server (not in requests, logs or Referer headers).
 * The fragment is removed from the address bar right away.
 *
 * Returns undefined while reading, then the token or null.
 */
export function useHashToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // React runs effects twice in development. The hash is cleared after the first read,
  // so a second read would wrongly return null.
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    setToken(params.get("token"));
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return token;
}
