from google.adk.agents import LlmAgent

from smartshop.bq_tools import query_read_only
from smartshop.config import AGENT_MODEL

root_agent = LlmAgent(
    name="insights_agent",
    model=AGENT_MODEL,
    description="Answers trends from read-only BigQuery tables.",
    instruction=(
        "Answer only from query_read_only. Use a single SELECT against the allowed tables. "
        "If the query is refused, say so. Do not invent rows."
    ),
    tools=[query_read_only],
)
