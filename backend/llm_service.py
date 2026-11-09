"""Async, local-only Ollama client with response validation and rate limiting."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable

import httpx

from .config import Settings


class LLMUnavailable(RuntimeError):
    """Ollama cannot be reached or cannot serve the requested local model."""


class LLMTimeout(RuntimeError):
    """Ollama did not generate a complete answer within the configured timeout."""


class RateLimitExceeded(RuntimeError):
    """An authenticated wallet exceeded its short in-memory request quota."""


class RateLimiter:
    """Simple per-wallet limiter suitable only for this MVP."""

    def __init__(self, maximum_requests: int, window_seconds: int, clock: Callable[[], float] = time.monotonic) -> None:
        self.maximum_requests = maximum_requests
        self.window_seconds = window_seconds
        self.clock = clock
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    def check(self, identity: str) -> None:
        now = self.clock()
        attempts = self._requests[identity]
        while attempts and attempts[0] <= now - self.window_seconds:
            attempts.popleft()
        if len(attempts) >= self.maximum_requests:
            raise RateLimitExceeded("Too many chat requests. Try again shortly.")
        attempts.append(now)


class LLMService:
    """Calls local Ollama `/api/chat`; cloud providers are never used."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.settings = settings
        self.transport = transport
        self.rate_limiter = RateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)

    async def chat(self, message: str, wallet_address: str) -> dict[str, str]:
        self.rate_limiter.check(wallet_address)
        payload = {
            "model": self.settings.ollama_model,
            "stream": False,
            "think": False,
            "messages": [{"role": "user", "content": message.strip()}],
            "options": {"num_predict": self.settings.ollama_max_tokens},
        }
        try:
            async with httpx.AsyncClient(
                base_url=self.settings.ollama_url,
                timeout=httpx.Timeout(self.settings.ollama_timeout_seconds),
                transport=self.transport,
            ) as client:
                response = await client.post("/api/chat", json=payload)
        except httpx.TimeoutException as error:
            raise LLMTimeout("Local Ollama request timed out.") from error
        except httpx.HTTPError as error:
            raise LLMUnavailable("Local Ollama is unavailable.") from error

        if response.status_code == 404:
            raise LLMUnavailable(f"Local Ollama model {self.settings.ollama_model!r} is unavailable.")
        if response.status_code >= 500:
            raise LLMUnavailable("Local Ollama could not generate a response.")
        if response.status_code >= 400:
            raise LLMUnavailable("Local Ollama rejected the request.")

        try:
            body = response.json()
            answer = body["message"]["content"]
        except (KeyError, TypeError, ValueError) as error:
            raise LLMUnavailable("Local Ollama returned an invalid response format.") from error
        if not isinstance(answer, str) or not answer.strip():
            # Qwen's optional `message.thinking` is never sent to the user.
            raise LLMUnavailable("Local Ollama returned no user-visible response.")
        visible_answer = answer.strip()
        if self._looks_like_reasoning(visible_answer):
            # Some older Ollama/Qwen combinations ignore `think: false` and put
            # chain-of-thought into `content`. Refuse it rather than leak it.
            raise LLMUnavailable(
                "Local model returned reasoning instead of a user-visible answer. "
                "Use a Qwen build that supports non-thinking mode."
            )
        model = body.get("model", self.settings.ollama_model)
        if not isinstance(model, str) or not model:
            model = self.settings.ollama_model
        return {"response": visible_answer, "model": model}

    @staticmethod
    def _looks_like_reasoning(answer: str) -> bool:
        normalized = answer.lower()
        prefixes = ("<think>", "hmm", "okay, the user", "the user is asking", "i need to")
        return normalized.startswith(prefixes)
