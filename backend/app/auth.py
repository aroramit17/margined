"""Auth helpers — validate Supabase JWT and project API keys."""

from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from supabase import create_client
from app.config import settings
from app.database import get_db

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> dict:
    """Validate a Supabase JWT and return the user payload."""
    token = credentials.credentials
    try:
        anon_client = create_client(settings.supabase_url, settings.supabase_anon_key)
        user = anon_client.auth.get_user(token)
        if user is None or user.user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"id": user.user.id, "email": user.user.email}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


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
