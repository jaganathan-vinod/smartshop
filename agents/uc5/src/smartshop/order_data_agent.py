import json
import os

import requests
from google.auth import default
from google.auth.transport.requests import Request

PROJECT = "project-fd286af4-b340-4967-86b"
LOCATION = "global"
DEFAULT_AGENT = f"projects/{PROJECT}/locations/{LOCATION}/dataAgents/smartshop-orders"
CHAT_URL = f"https://geminidataanalytics.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}:chat"


def ask_order_data_agent(question: str) -> dict:
    """Ask the orders BigQuery data agent for status, counts, revenue, or units sold.

    Args:
        question: The operator's question about orders. Money in the tables is integer cents.
    """
    agent = os.environ.get("ORDER_DATA_AGENT", DEFAULT_AGENT).strip() or DEFAULT_AGENT
    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(Request())
    response = requests.post(
        CHAT_URL,
        headers={"Authorization": f"Bearer {credentials.token}"},
        json={
            "parent": f"projects/{PROJECT}/locations/{LOCATION}",
            "messages": [{"userMessage": {"text": question}}],
            "data_agent_context": {"data_agent": agent},
        },
        timeout=90,
    )
    if response.status_code >= 400:
        return {"error": response.text[:2000], "dataAgent": agent}
    events = _events(response.text)
    answer = _final_text(events)
    sql = _generated_sql(events)
    result = {"dataAgent": agent, "answer": answer}
    if sql:
        result["sql"] = sql
    if not answer:
        result["error"] = "The orders data agent returned no answer"
    return result


def _events(body: str) -> list:
    text = body.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    if isinstance(parsed, dict):
        return [parsed]
    events = []
    acc = ""
    for line in text.splitlines():
        decoded = line.strip()
        if decoded == "[{":
            acc = "{"
        elif decoded == "}]":
            acc += "}"
        elif decoded in {",", ""}:
            continue
        else:
            acc += decoded
        try:
            item = json.loads(acc)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            events.append(item)
        acc = ""
    return events


def _final_text(events: list) -> str:
    final = []
    other = []
    for event in events:
        message = event.get("systemMessage")
        if not isinstance(message, dict):
            continue
        text = message.get("text")
        if not isinstance(text, dict):
            continue
        parts = text.get("parts")
        if not isinstance(parts, list):
            continue
        joined = "".join(part for part in parts if isinstance(part, str)).strip()
        if not joined:
            continue
        kind = str(text.get("textType") or "")
        if kind == "FINAL_RESPONSE":
            final.append(joined)
        elif kind != "THOUGHT":
            other.append(joined)
    return "\n".join(final or other[-1:])


def _generated_sql(events: list) -> str:
    for event in events:
        message = event.get("systemMessage")
        if not isinstance(message, dict):
            continue
        data = message.get("data")
        if isinstance(data, dict) and isinstance(data.get("generatedSql"), str):
            return data["generatedSql"]
    return ""
