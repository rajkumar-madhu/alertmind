import logging
import jwt
import requests
from django.conf import settings
from rest_framework import authentication, exceptions
from api.models import User

logger = logging.getLogger(__name__)

# Global cache for JWKS keys to avoid requesting Keycloak on every API call
_jwks_cache = {}

def get_keycloak_public_key(kid):
    global _jwks_cache
    if kid in _jwks_cache:
        return _jwks_cache[kid]

    # Fetch JWKS from Keycloak
    jwks_url = f"{settings.KEYCLOAK_SERVER_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs"
    try:
        response = requests.get(jwks_url, timeout=5)
        response.raise_for_status()
        jwks = response.json()
        
        for key in jwks.get("keys", []):
            k = key.get("kid")
            # Convert JWK to PEM format public key
            from jwt.algorithms import RSAAlgorithm
            pub_key = RSAAlgorithm.from_jwk(key)
            _jwks_cache[k] = pub_key
            
        if kid in _jwks_cache:
            return _jwks_cache[kid]
    except Exception as e:
        logger.error(f"Failed to fetch or parse JWKS from Keycloak: {e}")
        
    return None


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
            # 1. Unverified decode to extract the Key ID (kid)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            if not kid:
                raise exceptions.AuthenticationFailed("Invalid token header: missing 'kid'")

            # 2. Get public key
            public_key = get_keycloak_public_key(kid)
            
            # 3. Decode & verify signature
            if public_key:
                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=["RS256"],
                    audience=settings.KEYCLOAK_AUDIENCE,
                    options={"verify_aud": True}
                )
            else:
                # Fallback: if Keycloak is temporarily down during startup,
                # let's allow unverified decode *only* in debug mode for testing resilience.
                if settings.DEBUG:
                    logger.warning("Keycloak JWKS lookup failed. Using unverified payload in DEBUG mode.")
                    payload = jwt.decode(token, options={"verify_signature": False})
                else:
                    raise exceptions.AuthenticationFailed("Could not verify token: Keycloak JWKS offline")

            # 4. Extract user details
            email = payload.get("email")
            if not email:
                raise exceptions.AuthenticationFailed("Token does not contain email claim")
                
            name = payload.get("name") or payload.get("preferred_username") or email.split("@")[0]
            sub_uuid = payload.get("sub") # Keycloak internal UUID
            
            # Extract roles
            realm_access = payload.get("realm_access", {})
            token_roles = realm_access.get("roles", [])
            
            # Map roles to AlertMind roles: admin > engineer > viewer
            role = "viewer"
            if "admin" in token_roles:
                role = "admin"
            elif "engineer" in token_roles:
                role = "engineer"
            elif "viewer" in token_roles:
                role = "viewer"
                
            # Extract team (custom claim or default to Platform)
            team = payload.get("team", "Platform")

            # 5. Sync user in Postgres DB.
            # Key on email (the natural identifier shared with Keycloak), not the
            # token `sub`: seed/imported rows may already exist under that email with
            # a different id, and creating a duplicate would violate users_email_key.
            try:
                user, created = User.objects.get_or_create(
                    email=email,
                    defaults={
                        "id": sub_uuid,
                        "name": name,
                        "role": role,
                        "team": team,
                        "password_hash": "" # password managed by Keycloak
                    }
                )

                # Update details if role or name changed in Keycloak
                if not created:
                    updated = False
                    if user.role != role:
                        user.role = role
                        updated = True
                    if user.name != name:
                        user.name = name
                        updated = True
                    if user.email != email:
                        user.email = email
                        updated = True
                    if updated:
                        user.save()
            except Exception as db_err:
                logger.error(f"Error syncing user {email} in database: {db_err}")
                # Fallback: create in-memory user to avoid database blocker
                user = User(id=sub_uuid, email=email, name=name, role=role, team=team)

            # Store the raw payload inside the request user for OPA or view checks
            request.jwt_payload = payload
            return (user, token)

        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed("Token has expired")
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f"Invalid token: {e}")
        except Exception as e:
            logger.error(f"Auth exception: {e}")
            raise exceptions.AuthenticationFailed(str(e))
