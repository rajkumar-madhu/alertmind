import os
import unittest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "alertmind.settings")
os.environ.setdefault("NODE_ENV", "production")

import django

django.setup()

from rest_framework.exceptions import AuthenticationFailed
from rest_framework.test import APIRequestFactory

from api.auth import (
    KeycloakAuthentication,
    map_realm_roles,
    reset_jwks_cache,
    upsert_user_from_payload,
)
from unittest.mock import patch


class RoleMappingTests(unittest.TestCase):
    def test_admin_wins(self):
        self.assertEqual(map_realm_roles(["viewer", "admin", "engineer"]), "admin")

    def test_engineer(self):
        self.assertEqual(map_realm_roles(["engineer"]), "engineer")

    def test_unknown_defaults_viewer(self):
        self.assertEqual(map_realm_roles(["offline_access"]), "viewer")


class PayloadGuardTests(unittest.TestCase):
    def test_unverified_email_rejected(self):
        with self.assertRaises(AuthenticationFailed):
            upsert_user_from_payload({
                "sub": "x",
                "email": "a@b.c",
                "email_verified": False,
            })

    def test_missing_sub_rejected(self):
        with self.assertRaises(AuthenticationFailed):
            upsert_user_from_payload({"email": "a@b.c", "email_verified": True})

    def test_missing_email_rejected(self):
        with self.assertRaises(AuthenticationFailed):
            upsert_user_from_payload({"sub": "x", "email_verified": True})


class JwtFailClosedTests(unittest.TestCase):
    def setUp(self):
        reset_jwks_cache()
        self.factory = APIRequestFactory()

    def test_unknown_kid_is_rejected_in_production(self):
        # A well-formed JWT header with a kid that JWKS will not have.
        # Payload/signature need not be valid: we fail before verify when kid is unknown.
        import jwt as pyjwt
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        token = pyjwt.encode(
            {"sub": "x", "email": "a@b.c", "aud": "alertmind-frontend"},
            key,
            algorithm="RS256",
            headers={"kid": "unknown-kid"},
        )
        request = self.factory.get("/api/tickets/", HTTP_AUTHORIZATION=f"Bearer {token}")
        with patch("api.auth._fetch_jwks", return_value={}):
            with self.assertRaises(AuthenticationFailed):
                KeycloakAuthentication().authenticate(request)

    def test_unsigned_token_is_rejected(self):
        token = (
            "eyJhbGciOiJub25lIiwidHlwIjoiSldUIiwia2lkIjoieCJ9."
            "eyJlbWFpbCI6ImFkbWluQGFsZXJ0bWluZC5haSIsInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJhZG1pbiJdfX0."
        )
        request = self.factory.get("/api/tickets/", HTTP_AUTHORIZATION=f"Bearer {token}")
        with patch("api.auth._fetch_jwks", return_value={}):
            with self.assertRaises(AuthenticationFailed):
                KeycloakAuthentication().authenticate(request)

    def test_valid_signed_token_is_accepted(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        import jwt as pyjwt
        from unittest.mock import MagicMock

        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = private.public_key()
        token = pyjwt.encode(
            {
                "sub": "22222222-2222-2222-2222-222222222222",
                "email": "eng@alertmind.ai",
                "email_verified": True,
                "name": "Eng",
                "aud": "alertmind-frontend",
                "realm_access": {"roles": ["engineer"]},
            },
            private,
            algorithm="RS256",
            headers={"kid": "k1"},
        )
        fake_user = MagicMock()
        fake_user.email = "eng@alertmind.ai"
        request = self.factory.get("/api/tickets/", HTTP_AUTHORIZATION=f"Bearer {token}")
        with patch("api.auth.get_keycloak_public_key", return_value=public):
            with patch("api.auth.upsert_user_from_payload", return_value=fake_user):
                user, tok = KeycloakAuthentication().authenticate(request)
        self.assertEqual(user.email, "eng@alertmind.ai")
        self.assertEqual(tok, token)


if __name__ == "__main__":
    unittest.main()
