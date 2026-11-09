from __future__ import annotations

from datetime import datetime, timedelta, timezone

from eth_account import Account
from eth_account.messages import encode_defunct
import pytest


ORIGIN = "http://127.0.0.1:5173"


def sign_message(message: str, account) -> str:
    return "0x" + Account.sign_message(encode_defunct(text=message), account.key).signature.hex()


def login(client, account):
    challenge = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address})
    assert challenge.status_code == 200
    payload = challenge.json()
    verified = client.post(
        "/auth/verify",
        headers={"Origin": ORIGIN},
        json={"message": payload["message"], "signature": sign_message(payload["message"], account)},
    )
    assert verified.status_code == 200
    return payload, verified


def test_challenge_uses_exact_127_frontend_origin(make_client, account):
    client = make_client()
    response = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address})

    assert response.status_code == 200
    body = response.json()
    assert body["message"].startswith("127.0.0.1:5173 wants you to sign in")
    assert "URI: http://127.0.0.1:5173" in body["message"]
    assert "Chain ID: 31337" in body["message"]
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_state_changing_routes_reject_an_unexpected_origin(make_client, account):
    client = make_client()
    response = client.post(
        "/auth/challenge",
        headers={"Origin": "http://localhost:5173"},
        json={"address": account.address},
    )
    assert response.status_code == 403


def test_verify_sets_http_only_session_and_allows_status(make_client, account):
    client = make_client()
    _, verified = login(client, account)

    cookie = verified.headers.get("set-cookie", "")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie
    status_response = client.get("/access/status")
    assert status_response.status_code == 200
    assert status_response.json()["address"] == account.address


def test_verify_rejects_wrong_domain_even_with_a_valid_signature(make_client, account):
    client = make_client()
    challenge = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address}).json()
    modified = challenge["message"].replace("127.0.0.1:5173", "localhost:5173", 1)

    response = client.post(
        "/auth/verify",
        headers={"Origin": ORIGIN},
        json={"message": modified, "signature": sign_message(modified, account)},
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("expected", "replacement"),
    [
        ("URI: http://127.0.0.1:5173", "URI: http://127.0.0.1:9999"),
        ("Chain ID: 31337", "Chain ID: 1"),
    ],
)
def test_verify_rejects_wrong_uri_or_chain_id(make_client, account, expected, replacement):
    client = make_client()
    challenge = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address}).json()
    modified = challenge["message"].replace(expected, replacement)

    response = client.post(
        "/auth/verify",
        headers={"Origin": ORIGIN},
        json={"message": modified, "signature": sign_message(modified, account)},
    )
    assert response.status_code == 401


def test_verify_rejects_reused_nonce(make_client, account):
    client = make_client()
    challenge = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address}).json()
    signature = sign_message(challenge["message"], account)
    payload = {"message": challenge["message"], "signature": signature}

    assert client.post("/auth/verify", headers={"Origin": ORIGIN}, json=payload).status_code == 200
    assert client.post("/auth/verify", headers={"Origin": ORIGIN}, json=payload).status_code == 401


def test_verify_rejects_expired_nonce(make_client, account):
    client = make_client()
    challenge = client.post("/auth/challenge", headers={"Origin": ORIGIN}, json={"address": account.address}).json()
    auth = client.app.state.services.auth
    auth._challenges[challenge["nonce"]].expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    response = client.post(
        "/auth/verify",
        headers={"Origin": ORIGIN},
        json={"message": challenge["message"], "signature": sign_message(challenge["message"], account)},
    )
    assert response.status_code == 401


def test_logout_invalidates_the_session(make_client, account):
    client = make_client()
    login(client, account)
    assert client.post("/auth/logout", headers={"Origin": ORIGIN}).status_code == 204
    assert client.get("/access/status").status_code == 401
