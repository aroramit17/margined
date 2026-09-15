"""Auth helpers — validate Supabase JWT and project API keys."""

from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import httpx
from app.config import settings
from app.database import get_db

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> dict:
    """Validate a Supabase JWT and return the user payload."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Authentication not configured")
    try:
        # The retained supabase-py 2.9 DB client only accepts JWT-shaped API
        # keys. Auth's /user endpoint supports both new publishable and legacy
        # anon keys, and verifies the user's token with the issuing project.
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": settings.supabase_anon_key,
                     "Authorization": f"Bearer {credentials.credentials}"},
            timeout=10.0,
            follow_redirects=False,
        )
        if response.status_code in (401, 403):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        response.raise_for_status()
        user = response.json()
        if not isinstance(user, dict) or not isinstance(user.get("id"), str) or not user["id"]:
            raise ValueError("Missing authenticated user")
        return {"id": user["id"], "email": user.get("email")}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from None


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
