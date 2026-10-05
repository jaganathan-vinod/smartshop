import { Button, Card, Column, Text, createComponentImplementation } from "@a2ui/react/v0_9";
import { planChoiceSchema, SMARTSHOP_A2UI_CATALOG_ID, type PlanChoice } from "@smartshop/shared";
import { Catalog } from "@a2ui/web_core/v0_9";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ApiRequestError, getGcpAgentAsset } from "../api";
import { loadConfig } from "../config";

const PlanMap = lazy(() => import("../pages/PlanMap").then((module) => ({ default: module.PlanMap })));

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

const PlanApi = {
  name: "Plan",
  schema: z
    .object({
      choicesJson: z.string(),
    })
    .strict(),
};

const Plan = createComponentImplementation(PlanApi, function PlanView({ props }) {
  return <PlanCard choicesJson={props.choicesJson} />;
});

export const smartshopCatalog = new Catalog(SMARTSHOP_A2UI_CATALOG_ID, "0.9", [
  Column,
  Text,
  Card,
  Button,
  Asset,
  Plan,
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

function PlanCard({ choicesJson }: { choicesJson: string }) {
  const choices = readChoices(choicesJson);
  const [selectedId, setSelectedId] = useState(choices[0]?.id ?? "");
  const [mapsKey, setMapsKey] = useState("");
  const selected = choices.find((choice) => choice.id === selectedId) ?? choices[0];
  const ownStore = choices.find((choice) => choice.subjectKind === "CURRENT_STORE");
  const competitors = choices.filter((choice) => choice.subjectKind === "COMPETITOR");

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((config) => {
        if (!cancelled) {
          setMapsKey(config.mapsBrowserKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapsKey("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!selected) {
    return <p>The plan has no routes to draw.</p>;
  }

  return (
    <div className="gcp-plan">
      {ownStore ? (
        <div className="plan-group">
          <h2>Our store</h2>
          <PlanChoiceButton choice={ownStore} selected={selected.id === ownStore.id} onSelect={() => setSelectedId(ownStore.id)} />
        </div>
      ) : null}
      {competitors.length > 0 ? (
        <div className="plan-group">
          <h2>Competitors</h2>
          <ul className="plan-choices">
            {competitors.map((choice) => (
              <li key={choice.id}>
                <PlanChoiceButton
                  choice={choice}
                  selected={selected.id === choice.id}
                  onSelect={() => setSelectedId(choice.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="muted plan-map-caption">{selected.subjectName}</p>
      <Suspense fallback={<p className="muted">Loading map…</p>}>
        <PlanMap mapsKey={mapsKey} routeGeojson={selected.routeGeojson} />
      </Suspense>
    </div>
  );
}

function PlanChoiceButton({
  choice,
  selected,
  onSelect,
}: {
  choice: PlanChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const km = (choice.distanceMeters / 1000).toFixed(1);
  const minutes = Math.max(1, Math.round(choice.durationSeconds / 60));
  return (
    <button type="button" className={selected ? "plan-choice is-selected" : "plan-choice"} aria-pressed={selected} onClick={onSelect}>
      <span>{choice.subjectName}</span>
      <span>
        {km} km · {minutes} min
      </span>
    </button>
  );
}

function readChoices(choicesJson: string): PlanChoice[] {
  try {
    const parsed = planChoiceSchema.array().safeParse(JSON.parse(choicesJson) as unknown);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
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
