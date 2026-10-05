import base64
import json
import re
import uuid

import requests
from google.auth import default
from google.auth.transport.requests import Request
from google.cloud import storage

from smartshop.config import BUCKET, IMAGE_MODEL, PROJECT, VEO_LOCATION, VEO_MODEL


def _token() -> str:
    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(Request())
    return credentials.token


def describe_asset(tool_name: str, payload: object) -> str:
    """Return the operator line for a stored still or a started video."""
    if not isinstance(payload, dict) or payload.get("error"):
        return ""
    asset_id = str(payload.get("assetId") or "")
    if not re.fullmatch(r"asset_[a-f0-9]{12}", asset_id):
        return ""
    kind = "video" if tool_name == "start_campaign_video" or payload.get("gcsPrefix") else "image"
    status = str(payload.get("status") or "").upper()
    if status not in {"REVIEW", "GENERATING"}:
        status = "GENERATING" if kind == "video" else "REVIEW"
    return f"ASSET {asset_id} {kind} {status}"


def create_campaign_image(product_name: str, guidance: str) -> dict:
    """Create a square social-campaign still and store it for review.

    Args:
        product_name: Catalogue product to feature.
        guidance: How the still should look. Do not add a request to post it.
    """
    asset_id = f"asset_{uuid.uuid4().hex[:12]}"
    prompt = (
        f"Square product photo of {product_name} for a social campaign. "
        f"{guidance} No text overlay. Not a video."
    )
    url = (
        f"https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/"
        f"publishers/google/models/{IMAGE_MODEL}:generateContent"
    )
    request_body = {
        "contents": [{"role": "USER", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": "1:1"},
        },
    }
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        json=request_body,
        timeout=25,
    )
    payload = response.json()
    calls = [
        _api_call(
            "Vertex AI Gemini generateContent",
            url,
            {"model": IMAGE_MODEL, "productName": product_name, "guidance": guidance, "body": request_body},
            {"httpStatus": response.status_code, "error": _error_text(payload) if response.status_code != 200 else ""},
        )
    ]
    if response.status_code != 200:
        _save_trace(asset_id, calls)
        return {"error": "Image generation failed", "status": response.status_code, "apiTrace": calls}
    data = ""
    for candidate in payload.get("candidates") or []:
        for part in (candidate.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data") or {}
            if inline.get("data"):
                data = inline["data"]
    if not data:
        calls[0]["output"] = {"httpStatus": response.status_code, "error": "Image generation returned no bytes"}
        _save_trace(asset_id, calls)
        return {"error": "Image generation returned no bytes", "apiTrace": calls}
    uri = f"campaigns/{asset_id}.png"
    image_bytes = base64.b64decode(data)
    storage.Client().bucket(BUCKET).blob(uri).upload_from_string(image_bytes, content_type="image/png")
    gcs_uri = f"gs://{BUCKET}/{uri}"
    calls[0]["output"] = {"httpStatus": response.status_code, "hasImage": True, "assetId": asset_id}
    calls.append(
        _api_call(
            "Cloud Storage objects.insert",
            f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o",
            {"name": uri, "contentType": "image/png"},
            {"gcsUri": gcs_uri, "bytes": len(image_bytes)},
        )
    )
    _save_trace(asset_id, calls)
    return {
        "assetId": asset_id,
        "status": "REVIEW",
        "gcsUri": gcs_uri,
        "posted": False,
        "apiTrace": calls,
    }


def start_campaign_video(product_name: str, guidance: str) -> dict:
    """Start a six-second social-campaign video and return the operation to poll.

    Args:
        product_name: Catalogue product to feature.
        guidance: How the clip should look. Do not add a request to post it.
    """
    asset_id = f"asset_{uuid.uuid4().hex[:12]}"
    prefix = f"gs://{BUCKET}/videos/{asset_id}/"
    url = (
        f"https://{VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/"
        f"locations/{VEO_LOCATION}/publishers/google/models/{VEO_MODEL}:predictLongRunning"
    )
    prompt = f"Six second product clip of {product_name}. {guidance} No voiceover. No on-screen text."
    request_body = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "storageUri": prefix,
            "sampleCount": 1,
            "durationSeconds": 6,
            "aspectRatio": "16:9",
            "resolution": "720p",
        },
    }
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        json=request_body,
        timeout=20,
    )
    payload = response.json()
    call = _api_call(
        "Vertex AI Veo predictLongRunning",
        url,
        {"model": VEO_MODEL, "productName": product_name, "guidance": guidance, "body": request_body},
        {
            "httpStatus": response.status_code,
            "operationName": payload.get("name") or "",
            "error": "" if response.status_code == 200 and payload.get("name") else _error_text(payload) or "Video generation did not start",
        },
    )
    _save_trace(asset_id, [call])
    if response.status_code != 200 or not payload.get("name"):
        return {"error": "Video generation did not start", "status": response.status_code, "apiTrace": [call]}
    return {
        "assetId": asset_id,
        "status": "GENERATING",
        "operationName": payload["name"],
        "gcsPrefix": prefix,
        "posted": False,
        "apiTrace": [call],
    }


def _api_call(api: str, service: str, request: dict, response: dict) -> dict:
    return {"actor": "marketing_agent", "api": api, "service": service, "input": request, "output": response}


def _save_trace(asset_id: str, calls: list[dict]) -> None:
    try:
        storage.Client().bucket(BUCKET).blob(f"traces/{asset_id}.json").upload_from_string(
            json.dumps({"calls": calls}),
            content_type="application/json",
        )
    except Exception:
        return


def _error_text(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        return str(message or "")[:500]
    if isinstance(error, str):
        return error[:500]
    return ""
