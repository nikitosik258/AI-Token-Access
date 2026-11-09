from __future__ import annotations

import asyncio
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.blockchain import BlockchainUnavailable
from backend.llm_service import LLMService, LLMTimeout, LLMUnavailable
from backend.main import create_app

from .conftest import FakeBlockchain
from .test_auth_api import ORIGIN, login


class StubLLM:
    def __init__(self, result: dict | Exception | None = None) -> None:
        self.result = result or {"response": "Локальный ответ", "model": "qwen3:4b"}
        self.calls: list[tuple[str, str]] = []

    async def chat(self, message: str, wallet_address: str) -> dict:
        self.calls.append((message, wallet_address))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def client_with_llm(settings, *, has_access: bool, llm: StubLLM | LLMService) -> TestClient:
    return TestClient(create_app(settings=settings, blockchain=FakeBlockchain(has_access), llm=llm))


@pytest.mark.parametrize("subscription", ["MONTHLY", "YEARLY"])
def test_active_monthly_or_yearly_user_receives_a_model_response(settings, account, subscription):
    llm = StubLLM({"response": f"Ответ для {subscription}", "model": "qwen3:4b"})
    client = client_with_llm(settings, has_access=True, llm=llm)
    login(client, account)

    response = client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "Что такое блокчейн?"})

    assert response.status_code == 200
    assert response.json() == {"response": f"Ответ для {subscription}", "model": "qwen3:4b"}
    assert llm.calls == [("Что такое блокчейн?", account.address)]


@pytest.mark.parametrize("case", ["without_subscription", "expired_subscription"])
def test_user_without_active_access_is_denied_before_ollama(settings, account, case):
    llm = StubLLM()
    client = client_with_llm(settings, has_access=False, llm=llm)
    login(client, account)

    response = client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"})

    assert response.status_code == 403
    assert llm.calls == []


def test_unauthenticated_chat_is_rejected(settings):
    client = client_with_llm(settings, has_access=True, llm=StubLLM())
    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"}).status_code == 401


@pytest.mark.parametrize("message", ["   ", "x" * 2001])
def test_invalid_chat_message_is_rejected(settings, account, message):
    llm = StubLLM()
    client = client_with_llm(settings, has_access=True, llm=llm)
    login(client, account)

    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": message}).status_code == 422
    assert llm.calls == []


def test_missing_model_maps_to_503(settings, account):
    client = client_with_llm(settings, has_access=True, llm=StubLLM(LLMUnavailable("model missing")))
    login(client, account)

    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"}).status_code == 503


def test_llm_timeout_maps_to_504(settings, account):
    client = client_with_llm(settings, has_access=True, llm=StubLLM(LLMTimeout("slow model")))
    login(client, account)

    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"}).status_code == 504


def test_rpc_failure_blocks_ollama(settings, account):
    class BrokenBlockchain(FakeBlockchain):
        def get_access_status(self, address: str) -> dict:
            raise BlockchainUnavailable("RPC unavailable")

    llm = StubLLM()
    client = TestClient(create_app(settings=settings, blockchain=BrokenBlockchain(True), llm=llm))
    login(client, account)

    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"}).status_code == 503
    assert llm.calls == []


def test_rate_limit_applies_per_authenticated_wallet(settings, account):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "qwen3:4b", "message": {"content": "answer", "thinking": "hidden"}})

    service = LLMService(
        replace(settings, rate_limit_requests=1),
        transport=httpx.MockTransport(handler),
    )
    client = client_with_llm(settings, has_access=True, llm=service)
    login(client, account)

    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "first"}).json() == {"response": "answer", "model": "qwen3:4b"}
    assert client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "second"}).status_code == 429


def test_ollama_client_sends_stream_false_and_hides_thinking(settings):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"model": "qwen3:4b", "message": {"content": "visible", "thinking": "internal reasoning"}})

    service = LLMService(settings, transport=httpx.MockTransport(handler))
    result = asyncio.run(service.chat("question", "0x0000000000000000000000000000000000000001"))

    assert result == {"response": "visible", "model": "qwen3:4b"}
    assert captured["model"] == "qwen3:4b"
    assert captured["stream"] is False
    assert captured["options"]["num_predict"] == 512


def test_malformed_ollama_response_is_not_exposed(settings):
    service = LLMService(settings, transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"message": {"thinking": "only"}})))

    with pytest.raises(LLMUnavailable):
        asyncio.run(service.chat("question", "wallet"))


def test_reasoning_text_in_content_is_not_exposed(settings):
    service = LLMService(
        settings,
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"message": {"content": "Hmm, I need to think through this."}})
        ),
    )

    with pytest.raises(LLMUnavailable):
        asyncio.run(service.chat("question", "wallet"))
