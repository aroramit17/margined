import time
from types import SimpleNamespace
from unittest.mock import Mock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from app import auth

ISSUER = 'https://test.clerk.accounts.dev'
ORIGIN = 'http://127.0.0.1:5173'

@pytest.fixture(scope='module')
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)

@pytest.fixture
def configured(monkeypatch, signing_key):
    monkeypatch.setattr(auth.settings, 'clerk_issuer_url', ISSUER)
    monkeypatch.setattr(auth.settings, 'clerk_authorized_parties', ORIGIN)
    client = Mock()
    client.get_signing_key_from_jwt.return_value = SimpleNamespace(key=signing_key.public_key())
    monkeypatch.setattr(auth, '_jwks_client', lambda issuer: client)
    return client

def token(key, **overrides):
    now = int(time.time())
    claims = {'iss': ISSUER, 'sub': 'user_owner', 'sid': 'sess_test', 'azp': ORIGIN,
              'iat': now, 'nbf': now - 1, 'exp': now + 60, **overrides}
    return jwt.encode(claims, key, algorithm='RS256', headers={'kid':'test'})

def test_valid_clerk_session(configured, signing_key):
    assert auth.verify_clerk_token(token(signing_key))['sub'] == 'user_owner'

@pytest.mark.parametrize('claims', [
    {'iss':'https://other.clerk.accounts.dev'}, {'azp':'https://evil.example'},
    {'exp':1}, {'nbf':4102444800}, {'iat':4102444800}, {'sts':'pending'},
    {'sub':'not-a-clerk-user'}, {'sid':'machine-token'}, {'azp':None}, {'sub':None},
])
def test_rejects_invalid_claims(configured, signing_key, claims):
    with pytest.raises(HTTPException) as error:
        auth.verify_clerk_token(token(signing_key, **claims))
    assert error.value.status_code == 401

def test_rejects_wrong_signature(configured):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as error:
        auth.verify_clerk_token(token(other_key))
    assert error.value.status_code == 401

def test_rejects_unsigned_token_before_key_lookup(configured):
    unsigned = jwt.encode({'sub':'user_owner'}, '', algorithm='none')
    with pytest.raises(HTTPException) as error:
        auth.verify_clerk_token(unsigned)
    assert error.value.status_code == 401
    configured.get_signing_key_from_jwt.assert_not_called()

def test_rejects_missing_required_claim(configured, signing_key):
    claims = jwt.decode(token(signing_key), options={'verify_signature':False})
    del claims['exp']
    with pytest.raises(HTTPException):
        auth.verify_clerk_token(jwt.encode(claims,signing_key,algorithm='RS256'))

def test_jwks_outage_is_retryable(configured, signing_key):
    configured.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientConnectionError('unavailable')
    with pytest.raises(HTTPException) as error:
        auth.verify_clerk_token(token(signing_key))
    assert error.value.status_code == 503

def test_resolves_verified_subject_not_email(configured, signing_key, monkeypatch):
    db = Mock()
    db.rpc.return_value.execute.return_value.data = {'id':'internal-owner-uuid','clerk_user_id':'user_owner'}
    monkeypatch.setattr(auth,'get_db',lambda:db)
    result = auth.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer',credentials=token(signing_key)))
    assert result['id'] == 'internal-owner-uuid'
    db.rpc.assert_called_once_with('resolve_clerk_user',{'p_clerk_user_id':'user_owner'})

def test_invalid_token_never_provisions_a_user(configured, monkeypatch):
    database = Mock()
    monkeypatch.setattr(auth,'get_db',database)
    with pytest.raises(HTTPException):
        auth.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer',credentials='invalid'))
    database.assert_not_called()

def test_project_access_filters_internal_owner(monkeypatch):
    db=Mock(); query=db.table.return_value.select.return_value
    query.eq.return_value=query; query.limit.return_value=query
    query.execute.return_value.data=[]
    monkeypatch.setattr(auth,'get_db',lambda:db)
    with pytest.raises(HTTPException) as error:
        auth.require_project_access('other-project',{'id':'internal-owner'})
    assert error.value.status_code == 404
    assert any(call.args == ('user_id','internal-owner') for call in query.eq.call_args_list)
