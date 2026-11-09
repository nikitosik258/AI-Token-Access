from __future__ import annotations

from dataclasses import replace

import pytest
from eth_account import Account
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app


class FakeBlockchain:
    def __init__(self, has_access: bool = False) -> None:
        self.has_access = has_access

    def assert_ready(self) -> None:
        return None

    def get_plans(self) -> dict:
        return {
            "tokenDecimals": 18,
            "plans": [
                {"id": 1, "name": "MONTHLY", "priceMinimal": "100000000000000000000", "priceStk": "100", "durationSeconds": 2592000},
                {"id": 2, "name": "YEARLY", "priceMinimal": "1000000000000000000000", "priceStk": "1000", "durationSeconds": 31536000},
            ],
        }

    def get_frontend_contracts(self) -> dict:
        return {
            "network": {"name": "hardhat-local", "chainId": 31337, "rpcUrl": "http://127.0.0.1:8545"},
            "contracts": {
                "accessToken": {"address": "0x0000000000000000000000000000000000000001", "abi": []},
                "aiServiceAccess": {"address": "0x0000000000000000000000000000000000000002", "abi": []},
            },
        }

    def get_access_status(self, address: str) -> dict:
        return {
            "address": address,
            "stkBalanceMinimal": "300000000000000000000",
            "stkBalance": "300",
            "hasAccess": self.has_access,
            "expiresAt": 2_000_000_000 if self.has_access else 0,
            "remainingSeconds": 100 if self.has_access else 0,
            "plans": self.get_plans()["plans"],
        }


@pytest.fixture
def settings() -> Settings:
    return Settings()


@pytest.fixture
def account():
    return Account.create()


@pytest.fixture
def make_client(settings):
    def factory(has_access: bool = False, llm=None) -> TestClient:
        return TestClient(create_app(settings=settings, blockchain=FakeBlockchain(has_access), llm=llm))

    return factory
