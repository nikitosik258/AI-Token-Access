"""FastAPI application for SIWE authentication and on-chain access checks."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthService, AuthenticationError
from .blockchain import BlockchainService, BlockchainUnavailable
from .config import Settings
from .llm_service import LLMService, LLMTimeout, LLMUnavailable, RateLimitExceeded
from .schemas import ChallengeRequest, ChatRequest, VerifyRequest


@dataclass
class Services:
    settings: Settings
    auth: AuthService
    blockchain: BlockchainService
    llm: LLMService


def create_app(
    settings: Settings | None = None,
    blockchain: BlockchainService | None = None,
    llm: LLMService | None = None,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    settings.validate()
    app = FastAPI(title="AI Token Access API", version="0.1.0")
    app.state.services = Services(
        settings=settings,
        auth=AuthService(settings),
        blockchain=blockchain or BlockchainService(settings),
        llm=llm or LLMService(settings),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    def services(request: Request) -> Services:
        return request.app.state.services

    def require_frontend_origin(request: Request, current: Services = Depends(services)) -> None:
        # Mutating requests must come from the sole approved browser origin.
        if request.headers.get("origin") != current.settings.frontend_origin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin is not allowed.")

    def require_session(
        current: Services = Depends(services),
        session_token: str | None = Cookie(default=None, alias="ai_token_access_session"),
    ) -> str:
        try:
            return current.auth.get_session_address(session_token)
        except AuthenticationError as error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error

    @app.get("/health")
    def health(current: Services = Depends(services)) -> dict:
        try:
            current.blockchain.assert_ready()
            return {"status": "ok", "blockchain": "ok"}
        except BlockchainUnavailable as error:
            return {"status": "degraded", "blockchain": "unavailable", "detail": str(error)}

    @app.post("/auth/challenge")
    def challenge(
        payload: ChallengeRequest,
        _: None = Depends(require_frontend_origin),
        current: Services = Depends(services),
    ) -> dict:
        try:
            challenge_data = current.auth.create_challenge(payload.address)
        except AuthenticationError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
        return {
            "message": challenge_data.message,
            "nonce": challenge_data.nonce,
            "expiresAt": challenge_data.expires_at.isoformat(),
        }

    @app.post("/auth/verify")
    def verify(
        payload: VerifyRequest,
        response: Response,
        _: None = Depends(require_frontend_origin),
        current: Services = Depends(services),
    ) -> dict:
        try:
            session_token, address = current.auth.verify(payload.message, payload.signature)
        except AuthenticationError as error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
        response.set_cookie(
            key=current.settings.cookie_name,
            value=session_token,
            httponly=True,
            secure=current.settings.cookie_secure,
            samesite=current.settings.cookie_samesite,
            max_age=current.settings.session_ttl_seconds,
            path="/",
        )
        return {"address": address}

    @app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(
        _: None = Depends(require_frontend_origin),
        current: Services = Depends(services),
        session_token: str | None = Cookie(default=None, alias="ai_token_access_session"),
    ) -> Response:
        current.auth.logout(session_token)
        response = Response(status_code=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(key=current.settings.cookie_name, path="/")
        return response

    @app.get("/plans")
    def plans(current: Services = Depends(services)) -> dict:
        try:
            return current.blockchain.get_plans()
        except BlockchainUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    @app.get("/contracts/config")
    def contracts_config(current: Services = Depends(services)) -> dict:
        """Expose the verified, public browser configuration for the current deployment."""
        try:
            return current.blockchain.get_frontend_contracts()
        except BlockchainUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    @app.get("/access/status")
    def access_status(address: str = Depends(require_session), current: Services = Depends(services)) -> dict:
        try:
            return current.blockchain.get_access_status(address)
        except BlockchainUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    @app.post("/llm/chat")
    async def chat(
        payload: ChatRequest,
        _: None = Depends(require_frontend_origin),
        address: str = Depends(require_session),
        current: Services = Depends(services),
    ) -> dict:
        try:
            access = current.blockchain.get_access_status(address)
        except BlockchainUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
        if not access["hasAccess"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="An active subscription is required.")
        try:
            return await current.llm.chat(payload.message, address)
        except RateLimitExceeded as error:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
        except LLMTimeout as error:
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(error)) from error
        except LLMUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    return app


app = create_app()
