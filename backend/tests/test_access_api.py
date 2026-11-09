from __future__ import annotations

from .test_auth_api import ORIGIN, login


def test_plans_are_read_from_the_blockchain_adapter(make_client):
    client = make_client()
    response = client.get("/plans")

    assert response.status_code == 200
    assert response.json()["plans"][0]["priceStk"] == "100"
    assert response.json()["plans"][1]["priceStk"] == "1000"


def test_contract_configuration_is_read_from_the_verified_blockchain_adapter(make_client):
    response = make_client().get("/contracts/config")

    assert response.status_code == 200
    assert response.json()["network"]["chainId"] == 31337
    assert response.json()["contracts"]["aiServiceAccess"]["address"].endswith("2")


def test_access_status_requires_a_session(make_client):
    assert make_client().get("/access/status").status_code == 401


def test_chat_denies_an_authenticated_user_without_access(make_client, account):
    client = make_client(has_access=False)
    login(client, account)
    response = client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"})

    assert response.status_code == 403


def test_chat_returns_a_local_model_response_after_an_active_access_check(make_client, account):
    class SuccessfulLLM:
        async def chat(self, message: str, wallet_address: str) -> dict:
            return {"response": f"Local response to {message}", "model": "qwen3:4b"}

    client = make_client(has_access=True, llm=SuccessfulLLM())
    login(client, account)
    response = client.post("/llm/chat", headers={"Origin": ORIGIN}, json={"message": "hello"})

    assert response.status_code == 200
    assert response.json() == {"response": "Local response to hello", "model": "qwen3:4b"}
