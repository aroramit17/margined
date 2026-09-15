"""Auth helpers — verify Clerk sessions and retain project API-key access."""

from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from functools import lru_cache
import re
import jwt
from app.config import settings
from app.database import get_db

bearer = HTTPBearer()


@lru_cache(maxsize=4)
def _jwks_client(issuer: str):
    return jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", lifespan=300, timeout=10)


def verify_clerk_token(token: str) -> dict:
    issuer = settings.clerk_issuer_url.rstrip("/")
    parties = settings.clerk_authorized_parties_list
    if not issuer.startswith("https://") or not parties:
        raise HTTPException(status_code=503, detail="Clerk authentication not configured")
    try:
        if jwt.get_unverified_header(token).get("alg") != "RS256":
            raise jwt.InvalidAlgorithmError("Expected RS256")
        key = _jwks_client(issuer).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=issuer, leeway=5,
            options={"require": ["exp", "nbf", "iat", "iss", "sub", "sid", "azp"], "verify_aud": False})
        if (claims["azp"] not in parties or claims.get("sts") not in (None, "active")
            or not isinstance(claims["sub"], str) or not re.fullmatch(r"user_[A-Za-z0-9]+", claims["sub"])
            or not isinstance(claims["sid"], str) or not claims["sid"].startswith("sess_")):
            raise jwt.InvalidTokenError("Invalid session claims")
        return claims
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from None
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token") from None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> dict:
    """Verify the Clerk session, then resolve its stable internal owner UUID."""
    claims = verify_clerk_token(credentials.credentials)
    try:
        owner = get_db().rpc("resolve_clerk_user", {"p_clerk_user_id": claims["sub"]}).execute().data
        if not isinstance(owner, dict) or not owner.get("id") or owner.get("clerk_user_id") != claims["sub"]:
            raise ValueError("Invalid identity mapping")
        return {"id": owner["id"], "clerk_user_id": claims["sub"], "email": None}
    except Exception:
        raise HTTPException(status_code=503, detail="Account storage unavailable") from None


def get_project_by_api_key(api_key: str) -> Optional[dict]:
    """Look up a project by its SDK API key. Returns project dict or None."""
    db = get_db()
    try:
        result = (
            db.table("projects")
            .select("id, user_id, name")
            .eq("api_key", api_key)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    return result.data[0] if result.data else None


def require_project_access(project_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Verify the authenticated user owns the requested project."""
    db = get_db()
    try:
        result = (
            db.table("projects")
            .select("*")
            .eq("id", project_id)
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return result.data[0]
