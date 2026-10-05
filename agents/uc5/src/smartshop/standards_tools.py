from io import BytesIO

from google.cloud import storage
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from pypdf import PdfReader

from smartshop.config import BUCKET, DRIVE_FOLDER_ID

MAX_CHARS = 8000
MAX_FILES = 6
MAX_PAGES = 30


def search_standards(question: str) -> dict:
    """Read approved standards from the Google Drive folder and Cloud Storage manuals.

    Args:
        question: What the operator wants the standard to cover.
    """
    listed: list[dict[str, str]] = []
    if DRIVE_FOLDER_ID:
        listed.extend(_list_drive())
    listed.extend(_list_manuals())
    documents = [_load(item) for item in _ranked(question, listed, lambda item: item["name"])]
    return {"question": question, "documents": documents}


def read_document(name: str, data: bytes, mime: str = "") -> str:
    """Return plain text from a PDF or text manual."""
    lower = name.lower()
    if lower.endswith(".pdf") or mime == "application/pdf" or data.startswith(b"%PDF"):
        return _pdf_text(data)[:MAX_CHARS]
    if mime.startswith("text/") or lower.endswith((".txt", ".md", ".csv")):
        return data.decode("utf-8", errors="replace").strip()[:MAX_CHARS]
    return ""


def score_name(question: str, name: str) -> int:
    haystack = name.lower()
    return sum(1 for word in question.lower().split() if len(word) >= 4 and word in haystack)


def _list_manuals() -> list[dict[str, str]]:
    client = storage.Client()
    listed: list[dict[str, str]] = []
    for blob in client.list_blobs(BUCKET, prefix="manuals/", max_results=20):
        if blob.name.endswith("/"):
            continue
        listed.append(
            {
                "source": "gcs",
                "name": blob.name.rsplit("/", 1)[-1],
                "locator": blob.name,
                "mime": str(blob.content_type or ""),
            }
        )
    return listed


def _list_drive() -> list[dict[str, str]]:
    drive = build("drive", "v3", cache_discovery=False)
    listed = (
        drive.files()
        .list(
            q=f"'{DRIVE_FOLDER_ID}' in parents and trashed = false",
            fields="files(id,name,mimeType)",
            pageSize=20,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    files: list[dict[str, str]] = []
    for item in listed.get("files") or []:
        name = str(item.get("name") or "")
        file_id = str(item.get("id") or "")
        if not name or not file_id:
            continue
        files.append(
            {
                "source": "drive",
                "name": name,
                "locator": file_id,
                "mime": str(item.get("mimeType") or ""),
            }
        )
    return files


def _load(item: dict[str, str]) -> dict[str, str]:
    try:
        if item["source"] == "gcs":
            blob = storage.Client().bucket(BUCKET).blob(item["locator"])
            text = read_document(item["name"], blob.download_as_bytes(), item.get("mime") or "")
        elif item["source"] == "drive":
            mime = item.get("mime") or ""
            payload = _drive_bytes(item["locator"], mime)
            read_as = "text/plain" if mime.startswith("application/vnd.google-apps.") else mime
            text = read_document(item["name"], payload, read_as)
        else:
            text = ""
    except Exception as exc:
        return _document(item["source"], item["name"], "", str(exc))
    detail = "" if text else "This file has no readable text."
    return _document(item["source"], item["name"], text, detail)


def _drive_bytes(file_id: str, mime: str) -> bytes:
    files = build("drive", "v3", cache_discovery=False).files()
    if mime == "application/vnd.google-apps.document":
        request = files.export_media(fileId=file_id, mimeType="text/plain")
    elif mime == "application/vnd.google-apps.presentation":
        request = files.export_media(fileId=file_id, mimeType="text/plain")
    else:
        request = files.get_media(fileId=file_id, supportsAllDrives=True)
    buffer = BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue()


def _document(source: str, name: str, text: str, detail: str) -> dict[str, str]:
    document = {"source": source, "name": name, "text": text}
    if detail:
        document["detail"] = detail
    return document


def _pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        return ""
    parts: list[str] = []
    for page in reader.pages[:MAX_PAGES]:
        extracted = page.extract_text() or ""
        if extracted.strip():
            parts.append(extracted.strip())
    return "\n".join(parts).strip()


def _ranked(question: str, items: list, name_of) -> list:
    scored = [(score_name(question, name_of(item)), item) for item in items]
    matched = [item for score, item in scored if score > 0]
    chosen = matched or [item for _, item in scored]
    return chosen[:MAX_FILES]
