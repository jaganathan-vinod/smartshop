from google.adk.agents import LlmAgent

from smartshop.config import AGENT_MODEL
from smartshop.standards_tools import search_standards

root_agent = LlmAgent(
    name="standards_agent",
    model=AGENT_MODEL,
    description="Answers from approved Drive files and Cloud Storage manuals, with citations.",
    instruction=(
        "Call search_standards. Cite the file name you used. "
        "If no source matches, say the standard was not found. Do not invent a policy."
    ),
    tools=[search_standards],
)
