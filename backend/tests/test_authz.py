import unittest

from api.authz import classify_request, looks_like_uuid


class ClassifyRequestTests(unittest.TestCase):
    def test_list_tickets_is_read(self):
        c = classify_request("GET", "/api/tickets/")
        self.assertEqual(c["action"], "read")
        self.assertEqual(c["resource_type"], "ticket")
        self.assertIsNone(c["resource_id"])

    def test_create_ticket_is_create(self):
        c = classify_request("POST", "/api/tickets/")
        self.assertEqual(c["action"], "create")
        self.assertEqual(c["resource_type"], "ticket")

    def test_patch_ticket_is_update(self):
        tid = "11111111-1111-1111-1111-111111111111"
        c = classify_request("PATCH", f"/api/tickets/{tid}/")
        self.assertEqual(c["action"], "update")
        self.assertEqual(c["resource_id"], tid)

    def test_resolve_post_is_update_not_create(self):
        tid = "11111111-1111-1111-1111-111111111111"
        c = classify_request("POST", f"/api/tickets/{tid}/resolve/")
        self.assertEqual(c["action"], "update")
        self.assertEqual(c["resource_type"], "ticket")
        self.assertEqual(c["resource_id"], tid)
        self.assertEqual(c["nested"], "resolve")

    def test_analyze_post_is_update(self):
        tid = "11111111-1111-1111-1111-111111111111"
        c = classify_request("POST", f"/api/tickets/{tid}/analyze/")
        self.assertEqual(c["action"], "update")
        self.assertEqual(c["nested"], "analyze")

    def test_add_comment_is_comment_create(self):
        tid = "11111111-1111-1111-1111-111111111111"
        c = classify_request("POST", f"/api/tickets/{tid}/add-comment/")
        self.assertEqual(c["action"], "create")
        self.assertEqual(c["resource_type"], "comment")
        self.assertEqual(c["resource_id"], tid)

    def test_rag_search_post_is_read(self):
        c = classify_request("POST", "/api/rag/search/")
        self.assertEqual(c["action"], "read")
        self.assertEqual(c["resource_type"], "rag")
        self.assertIsNone(c["resource_id"])

    def test_rag_chat_post_is_read(self):
        c = classify_request("POST", "/api/rag/chat/")
        self.assertEqual(c["action"], "read")

    def test_ingest_is_document_create(self):
        c = classify_request("POST", "/api/ingest/")
        self.assertEqual(c["action"], "create")
        self.assertEqual(c["resource_type"], "document")

    def test_dashboard_is_unknown_read(self):
        c = classify_request("GET", "/api/dashboard/")
        self.assertEqual(c["action"], "read")
        self.assertEqual(c["resource_type"], "unknown")

    def test_looks_like_uuid(self):
        self.assertTrue(looks_like_uuid("11111111-1111-1111-1111-111111111111"))
        self.assertFalse(looks_like_uuid("resolve"))
        self.assertFalse(looks_like_uuid(None))


if __name__ == "__main__":
    unittest.main()
