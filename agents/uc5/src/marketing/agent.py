import json

from google.adk.agents import LlmAgent
from google.genai import types

from smartshop.config import AGENT_MODEL
from smartshop.media_tools import create_campaign_image, describe_asset, start_campaign_video


def remember_created_asset(
    tool: object,
    args: dict[str, object],
    tool_context: object,
    tool_response: object,
) -> dict[str, object] | None:
    """Remember the file the tool stored so the reply can point at it."""
    del args
    if not isinstance(tool_response, dict):
        return None
    state = getattr(tool_context, "state", None)
    traces = tool_response.get("apiTrace")
    if state is not None and isinstance(traces, list):
        stored = state.get("api_traces") if hasattr(state, "get") else None
        state["api_traces"] = [*(stored if isinstance(stored, list) else []), *traces]
    line = describe_asset(str(getattr(tool, "name", "")), tool_response)
    if state is not None and line:
        state["asset_line"] = line
    if not line and not traces:
        return None
    updated = dict(tool_response)
    if line:
        updated["operatorLine"] = line
    return updated


def append_asset_line(callback_context: object, llm_response: object) -> object | None:
    """Add the stored asset line when the model leaves it out of the reply."""
    state = getattr(callback_context, "state", None)
    line = state.get("asset_line") if hasattr(state, "get") else None
    traces = state.get("api_traces") if hasattr(state, "get") else None
    trace_lines = []
    if isinstance(traces, list):
        for item in traces:
            if isinstance(item, dict):
                trace_lines.append(f"TRACE {json.dumps(item, separators=(',', ':'))}")
    if not isinstance(line, str):
        line = ""
    if not line and not trace_lines:
        return None
    content = getattr(llm_response, "content", None)
    parts = list(getattr(content, "parts", None) or [])
    if not content or not parts or any(getattr(part, "function_call", None) for part in parts):
        return None
    text = "\n".join(getattr(part, "text", None) or "" for part in parts)
    extra = [item for item in [line, *trace_lines] if item and item not in text]
    if not extra:
        return None
    parts.append(types.Part(text="\n".join(extra)))
    content.parts = parts
    return llm_response


root_agent = LlmAgent(
    name="marketing_agent",
    model=AGENT_MODEL,
    description="Creates social-campaign stills and short videos for review.",
    instruction=(
        "Use the image tool for a still and the video tool for a clip. "
        "Tell the operator the asset is waiting for review. Never say it was posted. "
        "Do not invent an asset id. The tool result includes operatorLine; repeat that line exactly."
    ),
    tools=[create_campaign_image, start_campaign_video],
    after_tool_callback=remember_created_asset,
    after_model_callback=append_asset_line,
)
