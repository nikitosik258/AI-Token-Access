"""Strict local-only application configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


FRONTEND_ORIGIN = "http://127.0.0.1:5173"
BACKEND_ORIGIN = "http://127.0.0.1:8000"
RPC_URL = "http://127.0.0.1:8545"
OLLAMA_URL = "http://127.0.0.1:11434"
CHAIN_ID = 31337


@dataclass(frozen=True)
class Settings:
    """Runtime settings deliberately limited to the approved local endpoints."""

    frontend_origin: str = FRONTEND_ORIGIN
    backend_origin: str = BACKEND_ORIGIN
    rpc_url: str = RPC_URL
    ollama_url: str = OLLAMA_URL
    ollama_model: str = "qwen3:4b"
    chain_id: int = CHAIN_ID
    ollama_timeout_seconds: float = 60.0
    ollama_max_tokens: int = 512
    rate_limit_requests: int = 10
    rate_limit_window_seconds: int = 60
    challenge_ttl_seconds: int = 300
    session_ttl_seconds: int = 3600
    cookie_name: str = "ai_token_access_session"
    contracts_config_path: Path = Path(__file__).resolve().parents[1] / "shared" / "local-contracts.json"

    @property
    def siwe_domain(self) -> str:
        return "127.0.0.1:5173"

    @property
    def siwe_uri(self) -> str:
        return self.frontend_origin

    @property
    def cookie_secure(self) -> bool:
        # Local development uses plain HTTP. Production must use HTTPS and True.
        return False

    @property
    def cookie_samesite(self) -> str:
        # Ports differ but the 127.0.0.1 site is the same site.
        return "lax"

    @classmethod
    def from_environment(cls) -> "Settings":
        settings = cls(
            frontend_origin=os.getenv("FRONTEND_ORIGIN", FRONTEND_ORIGIN),
            backend_origin=os.getenv("BACKEND_ORIGIN", BACKEND_ORIGIN),
            rpc_url=os.getenv("HARDHAT_RPC_URL", RPC_URL),
            ollama_url=os.getenv("OLLAMA_BASE_URL", OLLAMA_URL),
            ollama_model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
            chain_id=int(os.getenv("CHAIN_ID", str(CHAIN_ID))),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        expected = {
            "frontend_origin": FRONTEND_ORIGIN,
            "backend_origin": BACKEND_ORIGIN,
            "rpc_url": RPC_URL,
            "ollama_url": OLLAMA_URL,
            "chain_id": CHAIN_ID,
        }
        for field_name, expected_value in expected.items():
            if getattr(self, field_name) != expected_value:
                raise ValueError(
                    f"{field_name} must be {expected_value!r}; localhost aliases are not allowed."
                )
        if not self.ollama_model.strip():
            raise ValueError("OLLAMA_MODEL must not be empty.")
        if self.ollama_timeout_seconds <= 0 or self.ollama_max_tokens <= 0:
            raise ValueError("Ollama timeout and generated-token limits must be positive.")
