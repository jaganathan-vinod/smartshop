from google.adk.agents import LlmAgent

from smartshop.config import AGENT_MODEL
from smartshop.media_tools import create_campaign_image, start_campaign_video

root_agent = LlmAgent(
    name="marketing_agent",
    model=AGENT_MODEL,
    description="Creates social-campaign stills and short videos for review.",
    instruction=(
        "Use the image tool for a still and the video tool for a clip. "
        "After the tool returns, include one line exactly: "
        "ASSET <assetId> <image|video> <REVIEW|GENERATING>. "
        "Use image and REVIEW for a still. Use video and GENERATING for a clip that just started. "
        "Tell the operator the asset is waiting for review. Never say it was posted."
    ),
    tools=[create_campaign_image, start_campaign_video],
)
