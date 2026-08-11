"""Shared LLM client: one call path for the agent executor, the PRD parser,
and PRD chat — every call returns its token usage for the ledger."""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


@dataclass
class LLMResult:
    text: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0


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


async def call_llm(
    provider: str,
    model: str,
    keys: dict,
    prompt: str,
    max_tokens: int = 1000,
    json_mode: bool = False,
) -> LLMResult:
    if provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=keys["anthropic"])
        msg = await client.messages.create(
            model=model, max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        usage = getattr(msg, "usage", None)
        return LLMResult(
            text=msg.content[0].text,
            model=model,
            tokens_in=getattr(usage, "input_tokens", 0) or 0,
            tokens_out=getattr(usage, "output_tokens", 0) or 0,
        )

    from openai import AsyncOpenAI
    base_url = GROQ_BASE_URL if provider == "groq" else None
    client = AsyncOpenAI(api_key=keys[provider], base_url=base_url)
    kwargs: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await client.chat.completions.create(**kwargs)
    usage = getattr(resp, "usage", None)
    return LLMResult(
        text=resp.choices[0].message.content or "",
        model=model,
        tokens_in=getattr(usage, "prompt_tokens", 0) or 0,
        tokens_out=getattr(usage, "completion_tokens", 0) or 0,
    )
