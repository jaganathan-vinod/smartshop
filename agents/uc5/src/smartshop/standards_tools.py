from google.cloud import storage
from googleapiclient.discovery import build

from smartshop.config import BUCKET, DRIVE_FOLDER_ID


def search_standards(question: str) -> dict:
    """Find approved standards in the Google Drive folder and manuals in Cloud Storage.

    Args:
        question: What the operator wants the standard to cover.
    """
    sources = []
    if DRIVE_FOLDER_ID:
        drive = build("drive", "v3", cache_discovery=False)
        listed = (
            drive.files()
            .list(
                q=f"'{DRIVE_FOLDER_ID}' in parents and trashed = false",
                fields="files(id,name,mimeType,modifiedTime)",
                pageSize=20,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        needle = question.lower()
        for item in listed.get("files") or []:
            name = item.get("name") or ""
            if needle in name.lower() or any(word in name.lower() for word in needle.split() if len(word) >= 4):
                sources.append(
                    {
                        "source": "drive",
                        "id": item.get("id"),
                        "name": name,
                        "modifiedTime": item.get("modifiedTime"),
                    }
                )
    else:
        sources.append({"source": "drive", "detail": "DRIVE_FOLDER_ID is not set"})

    manuals = []
    for blob in storage.Client().list_blobs(BUCKET, prefix="manuals/", max_results=20):
        manuals.append({"source": "gcs", "name": blob.name})
    return {"question": question, "sources": sources, "manuals": manuals}
