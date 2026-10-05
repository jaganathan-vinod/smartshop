import { Button, Card, Column, Text, createComponentImplementation } from "@a2ui/react/v0_9";
import { SMARTSHOP_A2UI_CATALOG_ID } from "@smartshop/shared";
import { Catalog } from "@a2ui/web_core/v0_9";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ApiRequestError, getGcpAgentAsset } from "../api";

const AssetApi = {
  name: "Asset",
  schema: z
    .object({
      assetId: z.string(),
      kind: z.enum(["image", "video"]),
      status: z.enum(["GENERATING", "REVIEW"]),
    })
    .strict(),
};

const Asset = createComponentImplementation(AssetApi, function AssetView({ props }) {
  return <AssetCard assetId={props.assetId} kind={props.kind} status={props.status} />;
});

export const smartshopCatalog = new Catalog(SMARTSHOP_A2UI_CATALOG_ID, "0.9", [
  Column,
  Text,
  Card,
  Button,
  Asset,
]);

const VIDEO_WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 8_000;

function AssetCard({
  assetId,
  kind,
  status,
}: {
  assetId: string;
  kind: "image" | "video";
  status: "GENERATING" | "REVIEW";
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState(statusLabel(kind, status));
  const shownKind = blob ? kindFromBlob(blob, kind) : kind;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const started = Date.now();

    async function load(): Promise<void> {
      try {
        const next = await getGcpAgentAsset(assetId);
        if (!stopped) {
          setBlob(next);
          setNote(statusLabel(kindFromBlob(next, kind), "REVIEW"));
        }
      } catch (caught) {
        if (stopped) {
          return;
        }
        const missing = caught instanceof ApiRequestError && caught.status === 404;
        if (status === "GENERATING" && missing && Date.now() - started < VIDEO_WAIT_MS) {
          setNote(statusLabel(kind, "GENERATING"));
          timer = window.setTimeout(() => {
            void load();
          }, POLL_MS);
          return;
        }
        setNote(missing ? "The file is not available yet." : "The file could not be loaded.");
      }
    }

    void load();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [assetId, kind, status]);

  useEffect(() => {
    if (!blob) {
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const fileName = fileNameFor(shownKind, assetId);

  return (
    <div className="gcp-asset">
      <p>{note}</p>
      {url ? <Media kind={shownKind} url={url} /> : null}
      <div className="gcp-asset-actions">
        <button type="button" disabled={!blob} onClick={() => dialogRef.current?.showModal()}>
          Expand
        </button>
        <button
          type="button"
          disabled={!blob}
          onClick={() => {
            if (blob) {
              downloadFile(blob, fileName);
            }
          }}
        >
          Download
        </button>
      </div>
      <dialog ref={dialogRef} className="gcp-expand" onClick={() => dialogRef.current?.close()}>
        <div onClick={(event) => event.stopPropagation()}>
          {url ? <Media kind={shownKind} url={url} /> : null}
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}

function kindFromBlob(blob: Blob, declared: "image" | "video"): "image" | "video" {
  if (blob.type.startsWith("image/")) {
    return "image";
  }
  if (blob.type.startsWith("video/")) {
    return "video";
  }
  return declared;
}

function Media({ kind, url }: { kind: "image" | "video"; url: string }) {
  switch (kind) {
    case "image":
      return <img src={url} alt="Campaign still" />;
    case "video":
      return <video src={url} controls playsInline />;
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function statusLabel(kind: "image" | "video", status: "GENERATING" | "REVIEW"): string {
  switch (status) {
    case "GENERATING":
      return kind === "video" ? "The video is generating." : "The image is generating.";
    case "REVIEW":
      return kind === "video" ? "Video ready for review." : "Image ready for review.";
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function fileNameFor(kind: "image" | "video", assetId: string): string {
  switch (kind) {
    case "image":
      return `${assetId}.png`;
    case "video":
      return `${assetId}.mp4`;
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function downloadFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
