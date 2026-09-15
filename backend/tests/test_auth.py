from unittest.mock import Mock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(auth.settings, "supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(auth.settings, "supabase_anon_key", "sb_publishable_test")


def credentials():
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="user-jwt")


def test_new_publishable_key_validates_with_issuing_project(configured, monkeypatch):
    request = httpx.Request("GET", "https://test.supabase.co/auth/v1/user")
    call = Mock(return_value=httpx.Response(200, request=request, json={"id": "owner", "email": "owner@example.com"}))
    monkeypatch.setattr(auth.httpx, "get", call)
    assert auth.get_current_user(credentials()) == {"id": "owner", "email": "owner@example.com"}
    call.assert_called_once_with(
        "https://test.supabase.co/auth/v1/user",
        headers={"apikey": "sb_publishable_test", "Authorization": "Bearer user-jwt"},
        timeout=10.0, follow_redirects=False,
    )


@pytest.mark.parametrize("status, expected", [(401, 401), (403, 401), (429, 503), (500, 503), (302, 503)])
def test_auth_failures_do_not_authenticate(configured, monkeypatch, status, expected):
    response = httpx.Response(status, request=httpx.Request("GET", "https://test.supabase.co/auth/v1/user"), json={})
    monkeypatch.setattr(auth.httpx, "get", Mock(return_value=response))
    with pytest.raises(HTTPException) as error:
        auth.get_current_user(credentials())
    assert error.value.status_code == expected


@pytest.mark.parametrize("result", [{}, {"id": None}, {"id": ""}, []])
def test_malformed_user_is_rejected(configured, monkeypatch, result):
    response = httpx.Response(200, request=httpx.Request("GET", "https://test.supabase.co/auth/v1/user"), json=result)
    monkeypatch.setattr(auth.httpx, "get", Mock(return_value=response))
    with pytest.raises(HTTPException) as error:
        auth.get_current_user(credentials())
    assert error.value.status_code == 503


def test_auth_outage_is_recoverable(configured, monkeypatch):
    monkeypatch.setattr(auth.httpx, "get", Mock(side_effect=httpx.ConnectTimeout("unavailable")))
    with pytest.raises(HTTPException) as error:
        auth.get_current_user(credentials())
    assert error.value.status_code == 503
