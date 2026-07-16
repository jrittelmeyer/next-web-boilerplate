"use client";

import { Button } from "@repo/ui/components/button";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { deleteUpload } from "@/server/actions/uploads";

export type UploadRow = {
  id: string;
  name: string;
  /** The served file (`ufs.sh`) — link target, and thumbnail source for images. */
  url: string;
  size: number;
  /** MIME type; null when Uploadthing reported none. */
  type: string | null;
  createdAt: Date;
};

type Status = { kind: "idle" } | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The signed-in user's uploads (P2-3 read path). The LIST is server-rendered (the
// page reads the `uploads` table directly); each row's Delete calls the
// `deleteUpload` Server Action (ownership re-checked server-side; remote-first —
// the row only goes once the file left storage, so an error keeps the row honest).
// On success the row is removed OPTIMISTICALLY (the P2-1 sessions-card pattern) and
// `router.refresh()` reconciles server truth in the background — the UI must not
// gate on the refresh committing (Next 16.2.9 race, see AUTH.md).
export function UploadsList({ rows }: { rows: UploadRow[] }) {
  const t = useTranslations("Uploads.list");
  const format = useFormatter();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());

  const visible = rows.filter((row) => !removedIds.has(row.id));

  async function remove(id: string) {
    setStatus({ kind: "idle" });
    setPending(id);
    const result = await deleteUpload(id);
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      setPending(null);
      return;
    }
    setRemovedIds((prev) => new Set([...prev, id]));
    setPending(null);
    router.refresh();
  }

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-md border p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              {row.type?.startsWith("image/") ? (
                // Optimized remote image (A6): next/image routes the ufs.sh thumbnail
                // through the same-origin /_next/image endpoint (responsive srcset +
                // modern formats), enabled by the `images.remotePatterns` *.ufs.sh
                // entry in next.config.ts. Fixed 40px thumbnail → explicit width/height
                // (h-10 w-10 = 40px); object-cover keeps non-square uploads square.
                <Image
                  src={row.url}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border text-xs text-muted-foreground">
                  {t("file")}
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {row.name}
                </a>
                <span className="truncate text-xs text-muted-foreground">
                  {t("meta", {
                    size: formatBytes(row.size),
                    date: format.dateTime(row.createdAt, "short"),
                  })}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => void remove(row.id)}
            >
              {pending === row.id ? t("deleting") : t("delete")}
            </Button>
          </li>
        ))}
      </ul>
      {status.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
