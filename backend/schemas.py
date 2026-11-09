"""Pydantic request and response models for the local API."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ChallengeRequest(BaseModel):
    address: str = Field(pattern=r"^0x[a-fA-F0-9]{40}$")


class VerifyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4096)
    signature: str = Field(pattern=r"^0x[a-fA-F0-9]{130}$")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message must not be blank.")
        return value
