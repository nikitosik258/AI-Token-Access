"""Read-only adapter for the verified local AI Token Access contracts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from eth_utils import is_address, to_checksum_address
from web3 import Web3

from .config import Settings


class BlockchainUnavailable(RuntimeError):
    """The RPC endpoint or exported deployment cannot be trusted."""


def format_token_amount(value: int, decimals: int) -> str:
    """Formats minimal ERC-20 units without floating-point precision loss."""
    whole, fraction = divmod(value, 10**decimals)
    if fraction == 0:
        return str(whole)
    return f"{whole}.{str(fraction).zfill(decimals).rstrip('0')}"


class BlockchainService:
    """Fails closed when the RPC or the local deployment is stale."""

    def __init__(self, settings: Settings, web3: Web3 | None = None) -> None:
        self.settings = settings
        self.web3 = web3 or Web3(Web3.HTTPProvider(settings.rpc_url, request_kwargs={"timeout": 5}))

    def _load_config(self) -> dict[str, Any]:
        # The export is replaced after a Hardhat restart. Read it for every
        # request so a long-running FastAPI process cannot serve old addresses.
        try:
            return json.loads(Path(self.settings.contracts_config_path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise BlockchainUnavailable(
                "Verified local contract configuration is unavailable. Redeploy and export it first."
            ) from error

    def _contracts(self):
        config = self._load_config()
        try:
            token = config["contracts"]["accessToken"]
            service = config["contracts"]["aiServiceAccess"]
            token_address = to_checksum_address(token["address"])
            service_address = to_checksum_address(service["address"])
        except (KeyError, TypeError, ValueError) as error:
            raise BlockchainUnavailable("Contract configuration is malformed.") from error
        return (
            config,
            token_address,
            service_address,
            self.web3.eth.contract(address=token_address, abi=token["abi"]),
            self.web3.eth.contract(address=service_address, abi=service["abi"]),
        )

    def assert_ready(self) -> None:
        if not self.web3.is_connected():
            raise BlockchainUnavailable("Hardhat RPC is unavailable.")
        config, token_address, service_address, token, service = self._contracts()
        if self.web3.eth.chain_id != self.settings.chain_id or config.get("network", {}).get("chainId") != self.settings.chain_id:
            raise BlockchainUnavailable("Hardhat chain ID does not match the verified configuration.")
        if self.web3.eth.get_code(token_address) in (b"", b"\x00") or self.web3.eth.get_code(service_address) in (b"", b"\x00"):
            raise BlockchainUnavailable("Contract bytecode is missing; the local deployment is stale.")
        try:
            if token.functions.name().call() != "Access Token" or token.functions.symbol().call() != "STK":
                raise BlockchainUnavailable("STK contract metadata does not match the expected deployment.")
            if to_checksum_address(service.functions.accessToken().call()) != token_address:
                raise BlockchainUnavailable("Subscription contract is linked to a different token.")
        except BlockchainUnavailable:
            raise
        except Exception as error:
            raise BlockchainUnavailable("Contract verification call failed.") from error

    def get_plans(self) -> dict[str, Any]:
        self.assert_ready()
        _, _, _, token, service = self._contracts()
        try:
            decimals = token.functions.decimals().call()
            result: dict[str, Any] = {"tokenDecimals": decimals, "plans": []}
            for plan_id, name in ((1, "MONTHLY"), (2, "YEARLY")):
                price = service.functions.getPlanPrice(plan_id).call()
                duration = service.functions.getPlanDuration(plan_id).call()
                result["plans"].append(
                    {
                        "id": plan_id,
                        "name": name,
                        "priceMinimal": str(price),
                        "priceStk": format_token_amount(price, decimals),
                        "durationSeconds": duration,
                    }
                )
            return result
        except Exception as error:
            raise BlockchainUnavailable("Unable to read plans from the blockchain.") from error

    def get_frontend_contracts(self) -> dict[str, Any]:
        """Return public ABIs only after validating the live local deployment."""
        self.assert_ready()
        config, token_address, service_address, _, _ = self._contracts()
        try:
            return {
                "network": {
                    "name": config["network"]["name"],
                    "chainId": self.settings.chain_id,
                    "rpcUrl": self.settings.rpc_url,
                },
                "contracts": {
                    "accessToken": {
                        "address": token_address,
                        "abi": config["contracts"]["accessToken"]["abi"],
                    },
                    "aiServiceAccess": {
                        "address": service_address,
                        "abi": config["contracts"]["aiServiceAccess"]["abi"],
                    },
                },
            }
        except (KeyError, TypeError) as error:
            raise BlockchainUnavailable("Contract configuration is malformed.") from error

    def get_access_status(self, user: str) -> dict[str, Any]:
        if not is_address(user):
            raise BlockchainUnavailable("Wallet address is invalid.")
        self.assert_ready()
        _, _, _, token, service = self._contracts()
        address = to_checksum_address(user)
        try:
            decimals = token.functions.decimals().call()
            balance = token.functions.balanceOf(address).call()
            expires_at = service.functions.getExpiration(address).call()
            has_access = service.functions.hasAccess(address).call()
            latest_timestamp = self.web3.eth.get_block("latest")["timestamp"]
            return {
                "address": address,
                "stkBalanceMinimal": str(balance),
                "stkBalance": format_token_amount(balance, decimals),
                "hasAccess": has_access,
                "expiresAt": expires_at,
                "remainingSeconds": max(0, expires_at - latest_timestamp),
                "plans": self.get_plans()["plans"],
            }
        except BlockchainUnavailable:
            raise
        except Exception as error:
            raise BlockchainUnavailable("Unable to read subscription status from the blockchain.") from error
