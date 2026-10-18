/**
 * Purpose: Runs one server export end to end for the Export and Agreement History
 * screens - start the job (Excel or PDF), poll GET /api/export/jobs/:id while it
 * is pending, then hand the file to the browser through a link to the download
 * endpoint (an attachment, so the page stays put). `busyKey` says which of a
 * screen's export buttons is running; `error` holds the last failure.
 */

import { useEffect, useRef, useState } from "react";

import { exportDownloadUrl, fetchExportJob } from "../api/client.ts";
import type { ExportJobStatus } from "../api/client.ts";

const POLL_INTERVAL_MS = 1500;
const FAILED_MESSAGE = "The export could not be generated. Please try again.";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function download(jobId: string): void {
  const link = document.createElement("a");
  link.href = exportDownloadUrl(jobId);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export interface ExportDownload {
  readonly busyKey: string | null;
  readonly error: string;
  readonly run: (key: string, start: () => Promise<ExportJobStatus>) => Promise<void>;
}

export function useExportDownload(): ExportDownload {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run(key: string, start: () => Promise<ExportJobStatus>): Promise<void> {
    setBusyKey(key);
    setError("");
    try {
      let job = await start();
      while (job.status === "pending" && mounted.current) {
        await wait(POLL_INTERVAL_MS);
        job = await fetchExportJob(job.jobId);
      }
      if (!mounted.current) return;
      if (job.status === "ready") download(job.jobId);
      else setError(FAILED_MESSAGE);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : FAILED_MESSAGE);
    } finally {
      if (mounted.current) setBusyKey(null);
    }
  }

  return { busyKey, error, run };
}
