"""Shared LLM client: one call path for the agent executor, the PRD parser,
and PRD chat — every call returns its token usage for the ledger."""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Current-generation Claude models: accept output_config (effort + JSON schema).
_CURRENT_CLAUDE = (
    "claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6",
)
# Models whose safety classifiers can decline; opt into server-side fallback
# so a declined request is re-run on Anthropic's recommended model instead.
_FALLBACK_CLAUDE = ("claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5")
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass
class LLMResult:
    text: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0


class LLMRefusal(RuntimeError):
    """The model declined the request (stop_reason == "refusal")."""


def pick_provider(keys: dict, model: str) -> str | None:
    """Provider for the requested model, falling back to any configured key."""
    if model.startswith("claude") and keys.get("anthropic"):
        return "anthropic"
    if model.startswith("gpt") and keys.get("openai"):
        return "openai"
    if model.startswith("llama") and keys.get("groq"):
        return "groq"
    for provider in ("anthropic", "openai", "groq"):
        if keys.get(provider):
            return provider
    return None


def _is_current_claude(model: str) -> bool:
    return model.startswith(_CURRENT_CLAUDE)


async def call_llm(
    provider: str,
    model: str,
    keys: dict,
    prompt: str,
    max_tokens: int = 4000,
    json_mode: bool = False,
    json_schema: dict | None = None,
    effort: str | None = None,
    system: str | None = None,
) -> LLMResult:
    """One user-turn completion.

    json_schema constrains the reply on providers that support it (current
    Claude models via output_config.format); callers must still parse
    defensively because older models only get the prompt instruction.
    """
    if provider == "anthropic":
        return await _call_anthropic(model, keys, prompt, max_tokens, json_schema, effort, system)

    from openai import AsyncOpenAI
    base_url = GROQ_BASE_URL if provider == "groq" else None
    client = AsyncOpenAI(api_key=keys[provider], base_url=base_url)
    messages = [{"role": "system", "content": system}] if system else []
    messages.append({"role": "user", "content": prompt})
    kwargs: dict = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if json_mode or json_schema:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await client.chat.completions.create(**kwargs)
    usage = getattr(resp, "usage", None)
    return LLMResult(
        text=resp.choices[0].message.content or "",
        model=model,
        tokens_in=getattr(usage, "prompt_tokens", 0) or 0,
        tokens_out=getattr(usage, "completion_tokens", 0) or 0,
    )


async def _call_anthropic(
    model: str, keys: dict, prompt: str, max_tokens: int,
    json_schema: dict | None, effort: str | None, system: str | None,
) -> LLMResult:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=keys["anthropic"])
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    if _is_current_claude(model):
        output_config: dict = {}
        if effort:
            output_config["effort"] = effort
        if json_schema:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}
        if output_config:
            kwargs["output_config"] = output_config

    if model.startswith(_FALLBACK_CLAUDE):
        msg = await client.beta.messages.create(betas=[_FALLBACK_BETA], fallbacks="default", **kwargs)
    else:
        msg = await client.messages.create(**kwargs)

    if msg.stop_reason == "refusal":
        details = getattr(msg, "stop_details", None)
        category = getattr(details, "category", None) if details else None
        raise LLMRefusal(f"The model declined this request{f' ({category})' if category else ''}.")

    # Content may open with thinking blocks — only text blocks are the answer.
    text = "".join(block.text for block in msg.content if block.type == "text")
    usage = getattr(msg, "usage", None)
    return LLMResult(
        text=text,
        model=model,
        tokens_in=getattr(usage, "input_tokens", 0) or 0,
        tokens_out=getattr(usage, "output_tokens", 0) or 0,
    )
