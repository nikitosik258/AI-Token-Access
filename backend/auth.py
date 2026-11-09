"""In-memory EIP-4361 authentication and HttpOnly-session management."""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import is_address, to_checksum_address

from .config import Settings


class AuthenticationError(ValueError):
    """Raised when a SIWE challenge or session is invalid."""


@dataclass
class Challenge:
    address: str
    nonce: str
    message: str
    expires_at: datetime
    consumed: bool = False


@dataclass
class Session:
    address: str
    expires_at: datetime


class AuthService:
    """Stores short-lived challenges and sessions in process memory for the MVP."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._challenges: dict[str, Challenge] = {}
        self._sessions: dict[str, Session] = {}

    def create_challenge(self, address: str) -> Challenge:
        if not is_address(address):
            raise AuthenticationError("Wallet address is invalid.")
        normalized_address = to_checksum_address(address)
        nonce = secrets.token_urlsafe(24)
        issued_at = datetime.now(timezone.utc)
        expires_at = issued_at + timedelta(seconds=self._settings.challenge_ttl_seconds)
        message = self._build_message(normalized_address, nonce, issued_at, expires_at)
        challenge = Challenge(normalized_address, nonce, message, expires_at)
        self._challenges[nonce] = challenge
        return challenge

    def verify(self, message: str, signature: str) -> tuple[str, str]:
        fields = self._parse_siwe_message(message)
        nonce = fields["nonce"]
        challenge = self._challenges.get(nonce)
        now = datetime.now(timezone.utc)

        if challenge is None or challenge.consumed:
            raise AuthenticationError("Nonce is unknown or has already been used.")
        if challenge.expires_at <= now:
            raise AuthenticationError("Challenge has expired.")
        if fields["domain"] != self._settings.siwe_domain:
            raise AuthenticationError("SIWE domain does not match the frontend origin.")
        if fields["uri"] != self._settings.siwe_uri:
            raise AuthenticationError("SIWE URI does not match the frontend origin.")
        if fields["chain_id"] != self._settings.chain_id:
            raise AuthenticationError("SIWE chain ID is not the local Hardhat chain.")
        if message != challenge.message:
            raise AuthenticationError("SIWE message differs from the server-issued challenge.")

        try:
            signer = to_checksum_address(Account.recover_message(encode_defunct(text=message), signature=signature))
        except Exception as error:  # eth-account exposes several implementation exceptions.
            raise AuthenticationError("SIWE signature is invalid.") from error
        if signer != challenge.address or fields["address"] != challenge.address:
            raise AuthenticationError("SIWE signature does not belong to the challenged wallet.")

        challenge.consumed = True
        session_token = secrets.token_urlsafe(32)
        self._sessions[session_token] = Session(
            address=signer,
            expires_at=now + timedelta(seconds=self._settings.session_ttl_seconds),
        )
        return session_token, signer

    def get_session_address(self, session_token: str | None) -> str:
        if not session_token:
            raise AuthenticationError("Authentication is required.")
        session = self._sessions.get(session_token)
        if session is None or session.expires_at <= datetime.now(timezone.utc):
            self._sessions.pop(session_token, None)
            raise AuthenticationError("Session is missing or has expired.")
        return session.address

    def logout(self, session_token: str | None) -> None:
        if session_token:
            self._sessions.pop(session_token, None)

    def _build_message(self, address: str, nonce: str, issued_at: datetime, expires_at: datetime) -> str:
        return (
            f"{self._settings.siwe_domain} wants you to sign in with your Ethereum account:\n"
            f"{address}\n\n"
            "Sign in to AI Token Access.\n\n"
            f"URI: {self._settings.siwe_uri}\n"
            "Version: 1\n"
            f"Chain ID: {self._settings.chain_id}\n"
            f"Nonce: {nonce}\n"
            f"Issued At: {issued_at.isoformat().replace('+00:00', 'Z')}\n"
            f"Expiration Time: {expires_at.isoformat().replace('+00:00', 'Z')}"
        )

    @staticmethod
    def _parse_siwe_message(message: str) -> dict[str, str | int]:
        lines = message.splitlines()
        if len(lines) < 8 or not lines[0].endswith(" wants you to sign in with your Ethereum account:"):
            raise AuthenticationError("Message is not a valid SIWE challenge.")
        address = lines[1]
        if not is_address(address):
            raise AuthenticationError("SIWE message contains an invalid address.")

        def get_field(label: str) -> str:
            match = re.search(rf"^{re.escape(label)}: (.+)$", message, re.MULTILINE)
            if not match:
                raise AuthenticationError(f"SIWE message is missing {label}.")
            return match.group(1)

        try:
            return {
                "domain": lines[0].removesuffix(" wants you to sign in with your Ethereum account:"),
                "address": to_checksum_address(address),
                "uri": get_field("URI"),
                "chain_id": int(get_field("Chain ID")),
                "nonce": get_field("Nonce"),
            }
        except ValueError as error:
            raise AuthenticationError("SIWE chain ID is invalid.") from error
