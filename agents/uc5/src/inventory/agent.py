from google.adk.agents import LlmAgent

from smartshop.action_tools import propose_stock_change
from smartshop.config import AGENT_MODEL

root_agent = LlmAgent(
    name="inventory_agent",
    model=AGENT_MODEL,
    description="Proposes stock changes and refuses them until the operator approves.",
    instruction=(
        "Call propose_stock_change with approved=false until the operator confirms the same product and quantity. "
        "Never claim the stock was written to SmartShop."
    ),
    tools=[propose_stock_change],
)
