import unittest

from api.hosts import (
    DEFAULT_ALLOWED_HOSTS,
    DEFAULT_CORS_ORIGINS,
    WECREW_API_HOST,
    WECREW_API_ORIGIN,
    WECREW_SPA_HOST,
    WECREW_SPA_ORIGIN,
    parse_csv,
)
from api.webhook_auth import is_public_webhook_host


class HostDefaultsTests(unittest.TestCase):
    def test_wecrew_spa_and_api_in_cors(self):
        self.assertIn(WECREW_SPA_ORIGIN, DEFAULT_CORS_ORIGINS)
        self.assertIn(WECREW_API_ORIGIN, DEFAULT_CORS_ORIGINS)

    def test_wecrew_hosts_in_allowed_hosts(self):
        self.assertIn(WECREW_SPA_HOST, DEFAULT_ALLOWED_HOSTS)
        self.assertIn(WECREW_API_HOST, DEFAULT_ALLOWED_HOSTS)
        self.assertIn("api", DEFAULT_ALLOWED_HOSTS)
        self.assertIn(".wecrew.in", DEFAULT_ALLOWED_HOSTS)

    def test_parse_csv_strips_and_dedupes(self):
        self.assertEqual(
            parse_csv(" https://alertmind.wecrew.in/,https://alertmind.wecrew.in "),
            ("https://alertmind.wecrew.in",),
        )

    def test_parse_csv_falls_back(self):
        self.assertEqual(parse_csv("", ("https://alertmind.wecrew.in",)), ("https://alertmind.wecrew.in",))

    def test_public_webhook_matches_wecrew_not_cluster(self):
        self.assertTrue(is_public_webhook_host(WECREW_SPA_HOST))
        self.assertTrue(is_public_webhook_host(WECREW_API_HOST))
        self.assertFalse(is_public_webhook_host("api.alertmind.svc.cluster.local"))
