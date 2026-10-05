from google.adk.agents import LlmAgent

from smartshop.bq_tools import query_read_only
from smartshop.config import AGENT_MODEL
from smartshop.order_data_agent import ask_order_data_agent

root_agent = LlmAgent(
    name="insights_agent",
    model=AGENT_MODEL,
    description="Answers trends from read-only BigQuery tables and order statistics from the orders data agent.",
    instruction=(
        "For routes, stores, catalogue products, and campaign assets, use query_read_only. "
        "Use a single SELECT against the allowed tables. "
        "For order status, order counts, revenue, average order value, premium orders, "
        "delivery method, or units sold, call ask_order_data_agent with the operator's question. "
        "Money from that tool is in cents unless the answer already converted it. "
        "If a tool is refused, say so. Do not invent rows."
    ),
    tools=[query_read_only, ask_order_data_agent],
)
