from google.adk.agents import LlmAgent

from smartshop.config import AGENT_MODEL
from smartshop.standards_tools import search_standards

root_agent = LlmAgent(
    name="standards_agent",
    model=AGENT_MODEL,
    description="Answers from approved Drive files and Cloud Storage manuals, with citations.",
    instruction=(
        "Call search_standards before answering a policy question. "
        "Answer only from the document text in the tool result, and cite the file name. "
        "If a document has no text, say that file was found but could not be read. "
        "If documents is empty, say the standard was not found. Do not invent a policy."
    ),
    tools=[search_standards],
)
