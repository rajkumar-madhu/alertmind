import logging
import threading
import time
import uuid
import jwt
import requests
from django.conf import settings
from rest_framework import authentication, exceptions
from api.models import User

logger = logging.getLogger(__name__)

# Process-local JWKS cache. Replaced wholesale on each successful fetch so
# rotated-out keys stop verifying. TTL forces a refresh even for known kids.
_jwks_lock = threading.Lock()
_jwks_cache = {}
_jwks_fetched_at = 0.0
JWKS_TTL_SECONDS = 3600


def _jwks_url():
    return (
        f"{settings.KEYCLOAK_SERVER_URL}/realms/{settings.KEYCLOAK_REALM}"
        "/protocol/openid-connect/certs"
    )


def _fetch_jwks():
    try:
        response = requests.get(_jwks_url(), timeout=5)
        response.raise_for_status()
        jwks = response.json()
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from Keycloak: {e}")
        return None

    from jwt.algorithms import RSAAlgorithm

    fetched = {}
    for key in jwks.get("keys", []):
        kid = key.get("kid")
        if not kid:
            continue
        kty = (key.get("kty") or "").upper()
        if kty and kty != "RSA":
            continue
        try:
            fetched[kid] = RSAAlgorithm.from_jwk(key)
        except Exception as e:
            logger.warning(f"Skipping JWKS key {kid}: {e}")
    return fetched


def get_keycloak_public_key(kid):
    """Return the RSA public key for `kid`, or None if it cannot be verified."""
    global _jwks_cache, _jwks_fetched_at
    if not kid:
        return None

    now = time.time()
    with _jwks_lock:
        if kid in _jwks_cache and (now - _jwks_fetched_at) < JWKS_TTL_SECONDS:
            return _jwks_cache[kid]

    fetched = _fetch_jwks()
    if fetched is not None:
        with _jwks_lock:
            _jwks_cache = fetched
            _jwks_fetched_at = time.time()
            return _jwks_cache.get(kid)

    with _jwks_lock:
        return _jwks_cache.get(kid)


def reset_jwks_cache():
    """Test helper — wipe the in-process JWKS cache."""
    global _jwks_cache, _jwks_fetched_at
    with _jwks_lock:
        _jwks_cache = {}
        _jwks_fetched_at = 0.0


def map_realm_roles(token_roles):
    """Map Keycloak realm roles onto AlertMind roles: admin > engineer > viewer."""
    roles = token_roles or []
    if "admin" in roles:
        return "admin"
    if "engineer" in roles:
        return "engineer"
    return "viewer"


def upsert_user_from_payload(payload):
    """Link a verified token to a `users` row.

    Identity key is Keycloak `sub` (stored as `token_identifier`). Email is
    used only to attach first login to a pre-seeded row. A token whose email
    already belongs to a different `sub` is rejected — never stolen.
    """
    email = payload.get("email")
    if not email:
        raise exceptions.AuthenticationFailed("Token does not contain email claim")
    if payload.get("email_verified") is False:
        raise exceptions.AuthenticationFailed("Email is not verified")

    sub = payload.get("sub")
    if not sub:
        raise exceptions.AuthenticationFailed("Token does not contain sub claim")

    name = payload.get("name") or payload.get("preferred_username") or email.split("@")[0]
    role = map_realm_roles(payload.get("realm_access", {}).get("roles", []))
    team = payload.get("team", "Platform")

    user = User.objects.filter(token_identifier=sub).first()
    if user:
        _sync_profile(user, email=email, name=name, role=role, team=team)
        return user

    user = User.objects.filter(email=email).first()
    if user:
        if user.token_identifier and user.token_identifier != sub:
            raise exceptions.AuthenticationFailed(
                "Email already linked to another identity"
            )
        user.token_identifier = sub
        _sync_profile(user, email=email, name=name, role=role, team=team)
        return user

    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError, AttributeError):
        user_id = uuid.uuid4()

    return User.objects.create(
        id=user_id,
        token_identifier=sub,
        email=email,
        name=name,
        role=role,
        team=team,
        password_hash="",
    )


def _sync_profile(user, *, email, name, role, team):
    updated = False
    if user.email != email:
        # Don't clobber another row's unique email.
        if User.objects.filter(email=email).exclude(pk=user.pk).exists():
            raise exceptions.AuthenticationFailed(
                "Email already linked to another identity"
            )
        user.email = email
        updated = True
    if user.name != name:
        user.name = name
        updated = True
    if user.role != role:
        user.role = role
        updated = True
    if (user.team or "Platform") != (team or "Platform"):
        user.team = team
        updated = True
    if updated:
        user.save()


class KeycloakAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None

        token = parts[1]
        try:
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            if not kid:
                raise exceptions.AuthenticationFailed("Invalid token header: missing 'kid'")

            public_key = get_keycloak_public_key(kid)
            if not public_key:
                raise exceptions.AuthenticationFailed(
                    "Could not verify token: Keycloak JWKS unavailable or unknown kid"
                )

            decode_kwargs = {
                "key": public_key,
                "algorithms": ["RS256"],
                "audience": settings.KEYCLOAK_AUDIENCE,
                "options": {"verify_aud": True, "verify_signature": True},
            }
            issuer = getattr(settings, "KEYCLOAK_ISSUER", "") or ""
            if issuer:
                decode_kwargs["issuer"] = issuer

            payload = jwt.decode(token, **decode_kwargs)
            user = upsert_user_from_payload(payload)
            request.jwt_payload = payload
            return (user, token)

        except exceptions.AuthenticationFailed:
            raise
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed("Token has expired")
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f"Invalid token: {e}")
        except Exception as e:
            logger.error(f"Auth exception: {e}")
            raise exceptions.AuthenticationFailed("Authentication failed")
