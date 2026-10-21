/**
 * Purpose: Hands a file the app already holds as a Blob (a template, an export) to
 * the browser as a download, through a temporary object URL and a synthetic link
 * click. Shared so every screen revokes the URL the same safe way - a moment later,
 * since revoking at once can cancel the download in some browsers.
 */

const REVOKE_DELAY_MS = 1000;

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
