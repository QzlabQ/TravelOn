"""Backward-compatible import path for the provider-neutral model client."""

from app.clients.openai_compatible_client import ModelRateLimitError, OpenAICompatibleClient

DeepSeekClient = OpenAICompatibleClient

__all__ = ["DeepSeekClient", "ModelRateLimitError", "OpenAICompatibleClient"]
