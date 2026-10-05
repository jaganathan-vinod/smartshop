import os

import httpx
from a2a.utils import constants as a2a_constants
from google.adk.a2a.agent import RemoteA2aAgent
from google.adk.agents import LlmAgent
from google.auth import default
from google.auth.transport.requests import Request

from .surface import attach_created_asset
from .surface import present_to_operator

LOCATION = "us-central1"
PROJECT = "project-fd286af4-b340-4967-86b"


class _GoogleAuth(httpx.Auth):
    def sync_auth_flow(self, request):
        request.headers["Authorization"] = f"Bearer {_token()}"
        request.headers["A2A-Version"] = a2a_constants.PROTOCOL_VERSION_CURRENT
        yield request

    async def async_auth_flow(self, request):
        request.headers["Authorization"] = f"Bearer {_token()}"
        request.headers["A2A-Version"] = a2a_constants.PROTOCOL_VERSION_CURRENT
        yield request


def _token() -> str:
    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(Request())
    return credentials.token


def _card_url(env_name: str) -> str:
    engine_id = os.environ[env_name].strip()
    return (
        f"https://{LOCATION}-aiplatform.googleapis.com/v1beta1/projects/{PROJECT}/"
        f"locations/{LOCATION}/reasoningEngines/{engine_id}/a2a/v1/card"
    )


class _AuthClient(httpx.AsyncClient):
    def __init__(self):
        super().__init__(auth=_GoogleAuth(), timeout=120)

    def __deepcopy__(self, memo):
        copied = _AuthClient()
        memo[id(self)] = copied
        return copied

    def __reduce__(self):
        return (_AuthClient, ())


def _remote(name: str, description: str, env_name: str) -> RemoteA2aAgent:
    return RemoteA2aAgent(
        name=name,
        description=description,
        agent_card=_card_url(env_name),
        httpx_client=_AuthClient(),
    )


delivery_agent = _remote(
    "delivery_agent",
    "Answers delivery delays and driving routes with Maps only.",
    "DELIVERY_ENGINE_ID",
)
insights_agent = _remote(
    "insights_agent",
    "Answers trends from read-only BigQuery tables and order statistics from the orders data agent.",
    "INSIGHTS_ENGINE_ID",
)
inventory_agent = _remote(
    "inventory_agent",
    "Proposes stock changes and refuses them until the operator approves.",
    "INVENTORY_ENGINE_ID",
)
standards_agent = _remote(
    "standards_agent",
    "Answers from approved Drive files and Cloud Storage manuals, with citations.",
    "STANDARDS_ENGINE_ID",
)
marketing_agent = _remote(
    "marketing_agent",
    "Creates social-campaign stills and short videos for review.",
    "MARKETING_ENGINE_ID",
)

root_agent = LlmAgent(
    name="coordinator",
    model=os.environ.get("AGENT_MODEL", "gemini-2.5-flash").strip(),
    description="Routes one SmartShop operations question to the right specialist over A2A.",
    instruction=(
        "You have no Maps, BigQuery, document, image, or video tool. "
        "Delegate delivery and routing to delivery_agent, "
        "order status, revenue, counts, and other trends to insights_agent, "
        "stock changes to inventory_agent, policies to standards_agent, "
        "and campaign stills or videos to marketing_agent. "
        "Each specialist is a separate agent reached over A2A. "
        "After the specialist answers, call present_to_operator exactly once. "
        "summary is the reply the operator should read. "
        "If that result includes assetId, pass it as asset_id. "
        "Use kind video when the result is a video or includes gcsPrefix, otherwise image. "
        "Pass status REVIEW or GENERATING from the result. "
        "If the specialist text contains a line ASSET <id> <image|video> <REVIEW|GENERATING>, "
        "copy the last such line into the tool and keep that line in the summary. "
        "Your final text must be the same summary the tool returns."
    ),
    tools=[present_to_operator],
    before_tool_callback=attach_created_asset,
    sub_agents=[
        delivery_agent,
        insights_agent,
        inventory_agent,
        standards_agent,
        marketing_agent,
    ],
)
