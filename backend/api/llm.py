"""LLM provider adapter for text generation.

Provider is chosen by configuration, first match wins:

  1. ``LLM_API_KEY``  -> any OpenAI-compatible /chat/completions endpoint, whose base
     URL is ``LLM_API_BASE`` and model ``LLM_API_MODEL``. This covers xAI (Grok),
     Groq, OpenAI, Together, vLLM, etc. — they all speak the same wire format.
  2. ``GROQ_API_KEY`` -> Groq. Kept for backwards compatibility with older deploys.
  3. Ollama           -> self-hosted at ``OLLAMA_BASE_URL``, model ``LLM_MODEL``.
     Ollama has no API key; it is the fallback whenever no key is configured.

IMPORTANT: a *present but invalid* key still selects that provider — the check is
"is a key set", not "does the key work". A dead key therefore fails closed rather than
silently falling back to Ollama, which is deliberate: silent downgrade to a small local
model would change answer quality with no signal.

Embeddings never come through here. ``tasks.generate_embedding()`` always calls Ollama,
because none of the hosted providers above serve an embedding model on this path.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _openai_chat(base_url, api_key, model, messages, temperature, timeout):
    """POST to an OpenAI-compatible chat-completions endpoint and return the text."""
    response = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "temperature": temperature},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def _provider():
    """Return (kind, base_url, api_key, model) for the configured provider."""
    if getattr(settings, "LLM_API_KEY", ""):
        return ("openai-compatible", settings.LLM_API_BASE, settings.LLM_API_KEY, settings.LLM_API_MODEL)
    if settings.GROQ_API_KEY:
        return ("groq", "https://api.groq.com/openai/v1", settings.GROQ_API_KEY, settings.GROQ_MODEL)
    return ("ollama", settings.OLLAMA_BASE_URL, "", settings.LLM_MODEL)


def generate(prompt, temperature=0.2, timeout=45):
    """Single-turn completion."""
    kind, base, key, model = _provider()
    if kind != "ollama":
        return _openai_chat(base, key, model, [{"role": "user", "content": prompt}], temperature, timeout)

    response = requests.post(
        f"{base}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False, "options": {"temperature": temperature}},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json().get("response", "")


def chat(messages, timeout=90):
    """Multi-turn conversation."""
    kind, base, key, model = _provider()
    if kind != "ollama":
        return _openai_chat(base, key, model, messages, 0.2, timeout)

    response = requests.post(
        f"{base}/api/chat",
        json={"model": model, "messages": messages, "stream": False},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "")
