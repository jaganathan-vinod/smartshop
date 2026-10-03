from google.adk.agents import LlmAgent

from smartshop.config import AGENT_MODEL
from smartshop.maps_tools import drive_duration, geocode_address, search_nearby_grocers

root_agent = LlmAgent(
    name="delivery_agent",
    model=AGENT_MODEL,
    description="Answers delivery delays and driving routes with Maps only.",
    instruction=(
        "Use the Maps tools for addresses, nearby grocers, and driving time. "
        "Do not invent a route. Do not query BigQuery or create images."
    ),
    tools=[geocode_address, search_nearby_grocers, drive_duration],
)
