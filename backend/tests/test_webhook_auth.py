import unittest

from api.webhook_auth import (
    extract_webhook_token,
    is_public_webhook_host,
    is_webhook_authorized,
)


class WebhookAuthTests(unittest.TestCase):
    def test_extract_custom_header(self):
        token = extract_webhook_token({"X-AlertMind-Webhook-Token": " s3cret "})
        self.assertEqual(token, "s3cret")

    def test_extract_bearer(self):
        token = extract_webhook_token({"Authorization": "Bearer abc"})
        self.assertEqual(token, "abc")

    def test_public_wecrew_hosts(self):
        self.assertTrue(is_public_webhook_host("alertmind.api.wecrew.in"))
        self.assertTrue(is_public_webhook_host("alertmind.wecrew.in:443"))
        self.assertFalse(is_public_webhook_host("api.alertmind.svc.cluster.local"))
        self.assertFalse(is_public_webhook_host("localhost"))

    def test_in_cluster_allows_missing_secret_in_production(self):
        # wecrew-ops Alertmanager → ClusterIP must keep working without a secret.
        self.assertTrue(
            is_webhook_authorized({}, "", debug=False, public_request=False)
        )

    def test_public_host_rejects_missing_secret_in_production(self):
        self.assertFalse(
            is_webhook_authorized({}, "", debug=False, public_request=True)
        )

    def test_debug_allows_missing_secret(self):
        self.assertTrue(is_webhook_authorized({}, "", debug=True, public_request=True))

    def test_wrong_token_rejected_even_in_debug(self):
        self.assertFalse(
            is_webhook_authorized(
                {"X-AlertMind-Webhook-Token": "nope"},
                "expected",
                debug=True,
            )
        )

    def test_matching_token_accepted(self):
        self.assertTrue(
            is_webhook_authorized(
                {"Authorization": "Bearer expected"},
                "expected",
                debug=False,
                public_request=True,
            )
        )

    def test_empty_provided_rejected_when_secret_set(self):
        self.assertFalse(
            is_webhook_authorized({}, "expected", debug=False, public_request=False)
        )


if __name__ == "__main__":
    unittest.main()
