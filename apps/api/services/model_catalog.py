"""Models offered in the UI pickers. Any model id the provider accepts still
works when typed in directly — this list is just the curated menu.

Edit freely when self-hosting; served to the web app at GET /api/meta.
"""

MODEL_CATALOG: list[dict] = [
    {"id": "claude-opus-5-5", "label": "Claude Opus 5.5", "provider": "anthropic",
     "note": "Recommended — strongest coding and planning"},
    {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "provider": "anthropic",
     "note": "Fast, capable, lower cost"},
    {"id": "claude-haiku-5-5", "label": "Claude Haiku 5.5", "provider": "anthropic",
     "note": "Cheapest — good for triage and analysis stages"},
    {"id": "claude-fable-5-1", "label": "Claude Fable 5.1", "provider": "anthropic",
     "note": "Most capable, premium pricing"},
    {"id": "gpt-5", "label": "GPT-5", "provider": "openai", "note": "OpenAI"},
    {"id": "gpt-4o-mini", "label": "GPT-4o mini", "provider": "openai", "note": "OpenAI, fast and cheap"},
    {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B", "provider": "groq",
     "note": "Open weights via Groq"},
]
