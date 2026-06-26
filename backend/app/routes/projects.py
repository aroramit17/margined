"""Project CRUD — create project, list projects, get API key."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import ProjectCreate, ProjectOut

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


def _generate_api_key() -> str:
    return "mgd_" + secrets.token_urlsafe(32)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, user: User):
    db = get_db()
    result = (
        db.table("projects")
        .insert({
            "user_id": user["id"],
            "name": body.name,
            "api_key": _generate_api_key(),
        })
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create project")
    return result.data[0]


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User):
    db = get_db()
    result = (
        db.table("projects")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project: Annotated[dict, Depends(require_project_access)]):
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    db.table("projects").delete().eq("id", project_id).execute()


@router.post("/{project_id}/rotate-key", response_model=ProjectOut)
def rotate_api_key(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    new_key = _generate_api_key()
    result = (
        db.table("projects")
        .update({"api_key": new_key})
        .eq("id", project_id)
        .execute()
    )
    return result.data[0]
