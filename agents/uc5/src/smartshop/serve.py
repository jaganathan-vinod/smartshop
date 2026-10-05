import importlib

from a2a.types import AgentSkill
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.runners import InMemoryRunner
from vertexai.agent_engines.templates.a2a import A2aAgent
from vertexai.agent_engines.templates.a2a import create_agent_card


def _executor(module_name: str) -> A2aAgentExecutor:
    agent = importlib.import_module(module_name).root_agent
    return A2aAgentExecutor(runner=InMemoryRunner(agent=agent, app_name=agent.name))


def build_delivery_executor() -> A2aAgentExecutor:
    return _executor("delivery.agent")


def build_insights_executor() -> A2aAgentExecutor:
    return _executor("insights.agent")


def build_inventory_executor() -> A2aAgentExecutor:
    return _executor("inventory.agent")


def build_standards_executor() -> A2aAgentExecutor:
    return _executor("standards.agent")


def build_marketing_executor() -> A2aAgentExecutor:
    return _executor("marketing.agent")


def _agent(name: str, description: str, skill_id: str, builder) -> A2aAgent:
    card = create_agent_card(
        agent_name=name,
        description=description,
        skills=[
            AgentSkill(
                id=skill_id,
                name=name,
                description=description,
                tags=[skill_id],
            )
        ],
    )
    return A2aAgent(agent_card=card, agent_executor_builder=builder)


def delivery_a2a() -> A2aAgent:
    return _agent(
        "delivery_agent",
        "Answers delivery delays and driving routes with Maps only.",
        "routes",
        build_delivery_executor,
    )


def insights_a2a() -> A2aAgent:
    return _agent(
        "insights_agent",
        "Answers trends from read-only BigQuery tables and order statistics from the orders data agent.",
        "insights",
        build_insights_executor,
    )


def inventory_a2a() -> A2aAgent:
    return _agent(
        "inventory_agent",
        "Proposes stock changes and refuses them until the operator approves.",
        "inventory",
        build_inventory_executor,
    )


def standards_a2a() -> A2aAgent:
    return _agent(
        "standards_agent",
        "Answers from approved Drive files and Cloud Storage manuals, with citations.",
        "standards",
        build_standards_executor,
    )


def marketing_a2a() -> A2aAgent:
    return _agent(
        "marketing_agent",
        "Creates social-campaign stills and short videos for review.",
        "marketing",
        build_marketing_executor,
    )
