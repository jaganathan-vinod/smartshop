import base64
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
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        json={
            "contents": [{"role": "USER", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {"aspectRatio": "1:1"},
            },
        },
        timeout=25,
    )
    payload = response.json()
    if response.status_code != 200:
        return {"error": "Image generation failed", "status": response.status_code}
    data = ""
    for candidate in payload.get("candidates") or []:
        for part in (candidate.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data") or {}
            if inline.get("data"):
                data = inline["data"]
    if not data:
        return {"error": "Image generation returned no bytes"}
    uri = f"campaigns/{asset_id}.png"
    storage.Client().bucket(BUCKET).blob(uri).upload_from_string(
        base64.b64decode(data), content_type="image/png"
    )
    return {
        "assetId": asset_id,
        "status": "REVIEW",
        "gcsUri": f"gs://{BUCKET}/{uri}",
        "posted": False,
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
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        json={
            "instances": [
                {
                    "prompt": (
                        f"Six second product clip of {product_name}. {guidance} "
                        "No voiceover. No on-screen text."
                    )
                }
            ],
            "parameters": {
                "storageUri": prefix,
                "sampleCount": 1,
                "durationSeconds": 6,
                "aspectRatio": "16:9",
                "resolution": "720p",
            },
        },
        timeout=20,
    )
    payload = response.json()
    if response.status_code != 200 or not payload.get("name"):
        return {"error": "Video generation did not start", "status": response.status_code}
    return {
        "assetId": asset_id,
        "status": "GENERATING",
        "operationName": payload["name"],
        "gcsPrefix": prefix,
        "posted": False,
    }
