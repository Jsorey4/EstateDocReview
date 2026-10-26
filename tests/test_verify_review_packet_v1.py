"""Protocol-level verifier checks; no estate documents or answer keys."""
import copy
import unittest
from legacy.verify_review_packet_v1 import normalize, verify


class ReviewPacketV1VerifierTests(unittest.TestCase):
    def packet(self):
        return {"schemaVersion": 1, "documents": [{"id": "d", "source": "synthetic", "pages": [{"page": 1, "text": "A B"}]}], "facts": [{"id": "f", "documentId": "d", "quote": "B", "page": 1}]}

    def test_quote_presence(self):
        source = self.packet()
        original = copy.deepcopy(source)
        result = verify(source)
        self.assertEqual(result["facts"][0]["verification"], "verified")
        self.assertEqual(result["verifiedBy"], "verify_quotes.py")
        self.assertEqual(source, original)

    def test_wrong_page_or_case_stays_unverified(self):
        for patch in ({"page": 2}, {"quote": "b"}, {"quote": " "}):
            source = self.packet()
            source["facts"][0].update(patch)
            self.assertEqual(verify(source)["facts"][0]["verification"], "unverified")

    def test_duplicate_pages_are_rejected(self):
        source = self.packet()
        source["documents"][0]["pages"].append({"page": 1, "text": "C"})
        with self.assertRaises(ValueError):
            verify(source)

    def test_source_restrictions(self):
        for label in ("private", "public"):
            source = self.packet()
            source["documents"][0]["source"] = label
            with self.assertRaises(ValueError):
                verify(source)

    def test_whitespace_normalization(self):
        self.assertEqual(normalize("  A\n\tB  "), "A B")


if __name__ == "__main__":
    unittest.main()
