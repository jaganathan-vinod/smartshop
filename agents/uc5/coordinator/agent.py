import os

import httpx
from a2a.types import AgentCapabilities
from a2a.types import AgentCard
from a2a.types import AgentInterface
from a2a.types import AgentSkill
from a2a.utils.constants import PROTOCOL_VERSION_CURRENT
from a2a.utils.constants import TransportProtocol
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
        request.headers["A2A-Version"] = PROTOCOL_VERSION_CURRENT
        yield request

    async def async_auth_flow(self, request):
        request.headers["Authorization"] = f"Bearer {_token()}"
        request.headers["A2A-Version"] = PROTOCOL_VERSION_CURRENT
        yield request


def _token() -> str:
    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(Request())
    return credentials.token


def _card(name: str, description: str, env_name: str) -> AgentCard:
    engine_id = os.environ[env_name].strip()
    url = (
        f"https://{LOCATION}-aiplatform.googleapis.com/v1beta1/projects/{PROJECT}/"
        f"locations/{LOCATION}/reasoningEngines/{engine_id}/a2a"
    )
    return AgentCard(
        name=name,
        description=description,
        version="1.0.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=False),
        skills=[AgentSkill(id=name, name=name, description=description, tags=[name])],
        supported_interfaces=[
            AgentInterface(
                url=url,
                protocol_binding=TransportProtocol.HTTP_JSON,
                protocol_version=PROTOCOL_VERSION_CURRENT,
            )
        ],
    )


def _remote(name: str, description: str, env_name: str) -> RemoteA2aAgent:
    return RemoteA2aAgent(
        name=name,
        description=description,
        agent_card=_card(name, description, env_name),
        httpx_client=httpx.AsyncClient(auth=_GoogleAuth(), timeout=120),
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
