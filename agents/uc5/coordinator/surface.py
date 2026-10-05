"""A2UI v0.9 surfaces for the SmartShop coordinator.

The message envelopes match CreateSurfaceMessage, UpdateComponentsMessage, and
UpdateDataModelMessage from a2ui-agent-sdk 0.7.0. That package cannot be
installed beside a2a-sdk 1.2.1, which this agent needs for its specialist calls.
"""

from __future__ import annotations

import re
import uuid

CATALOG_ID = "https://smartshop.dev/a2ui/v0.9/catalog.json"
ASSET_LINE = re.compile(
    r"ASSET\s+(asset_[a-f0-9]{12})\s+(image|video)\s+(REVIEW|GENERATING)",
    re.IGNORECASE,
)


def present_to_operator(
    summary: str,
    asset_id: str = "",
    kind: str = "",
    status: str = "",
) -> dict[str, object]:
    """Show the operator one reply. Copy asset_id, kind, and status from a specialist result when it created an image or video."""
    text = summary.strip()
    parsed_id, parsed_kind, parsed_status = _asset_line(text)
    chosen_id = asset_id.strip() or parsed_id
    chosen_kind = kind.strip().lower() or parsed_kind
    chosen_status = status.strip().upper() or parsed_status
    visible = ASSET_LINE.sub("", text).strip() or _fallback(chosen_kind, chosen_status)
    surface_id = f"s_{uuid.uuid4().hex[:12]}"
    return {
        "summary": visible,
        "a2ui": _messages(visible, surface_id, chosen_id, chosen_kind, chosen_status),
    }


def _messages(
    summary: str,
    surface_id: str,
    asset_id: str,
    kind: str,
    status: str,
) -> list[dict[str, object]]:
    children = ["summary"]
    components: list[dict[str, object]] = [
        {"id": "summary", "component": "Text", "text": summary, "variant": "body"},
    ]
    asset: dict[str, str] | None = None
    if _asset_ok(asset_id, kind, status):
        children.append("asset")
        asset = {"assetId": asset_id, "kind": kind, "status": status}
        components.append({"id": "asset", "component": "Asset", **asset})
    components.insert(0, {"id": "root", "component": "Column", "children": children})
    return [
        {
            "version": "v0.9",
            "createSurface": {"surfaceId": surface_id, "catalogId": CATALOG_ID},
        },
        {
            "version": "v0.9",
            "updateComponents": {"surfaceId": surface_id, "components": components},
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": surface_id,
                "path": "/",
                "value": {"summary": summary, "asset": asset},
            },
        },
    ]


def attach_created_asset(tool: object, args: dict[str, object], tool_context: object) -> None:
    """Copy the newest specialist asset into present_to_operator when the model omits it."""
    if getattr(tool, "name", "") != "present_to_operator" or not isinstance(args, dict):
        return None
    summary = str(args.get("summary") or "")
    asset_id, kind, status = _asset_line(summary)
    if not asset_id:
        asset_id, kind, status = _latest_session_asset(getattr(tool_context, "session", None))
    if not asset_id:
        return None
    if not str(args.get("asset_id") or "").strip():
        args["asset_id"] = asset_id
    if not str(args.get("kind") or "").strip():
        args["kind"] = kind
    if not str(args.get("status") or "").strip():
        args["status"] = status
    line = f"ASSET {asset_id} {kind} {status}"
    if line not in summary:
        args["summary"] = f"{summary}\n{line}".strip()
    return None


def _asset_line(summary: str) -> tuple[str, str, str]:
    matches = list(ASSET_LINE.finditer(summary))
    if not matches:
        return "", "", ""
    match = matches[-1]
    return match.group(1), match.group(2).lower(), match.group(3).upper()


def _latest_session_asset(session: object) -> tuple[str, str, str]:
    found = ("", "", "")
    for event in getattr(session, "events", None) or []:
        parsed = _asset_line(_event_text(event))
        if parsed[0]:
            found = parsed
    return found


def _event_text(event: object) -> str:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    chunks: list[str] = []
    for part in parts:
        text = getattr(part, "text", None)
        if isinstance(text, str):
            chunks.append(text)
        for name in ("function_response", "function_call"):
            payload = getattr(part, name, None)
            if payload is not None:
                chunks.append(repr(payload))
    return "\n".join(chunks)


def _asset_ok(asset_id: str, kind: str, status: str) -> bool:
    return bool(re.fullmatch(r"asset_[a-f0-9]{12}", asset_id)) and kind in {"image", "video"} and status in {
        "REVIEW",
        "GENERATING",
    }


def _fallback(kind: str, status: str) -> str:
    if status == "GENERATING":
        return "The video is generating."
    if kind in {"image", "video"}:
        return "The asset is ready for review."
    return "Done."
