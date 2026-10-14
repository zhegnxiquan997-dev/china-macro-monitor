import unittest
from archive_collector import parse_period, parse_api_response, merge_records, number, source_is_official

METRIC = {
    "id": "retail", "start_year": 2000, "unit": "%",
    "frequency": "monthly", "kind": "yoy",
    "code": "d0cb882c7f27443ab6b3ef9421901961:aaac57d54d2e465d91bc9f3ea1a8618e",
}


class MacroCollectorTest(unittest.TestCase):
    def test_period(self):
        self.assertEqual(parse_period("200001MM"), "2000-01")
        self.assertEqual(parse_period("202608MM"), "2026-08")
        self.assertIsNone(parse_period("200013MM"))
        self.assertIsNone(parse_period("wrong"))

    def test_official(self):
        self.assertTrue(source_is_official("https://data.stats.gov.cn/"))
        self.assertTrue(source_is_official("https://tjj.gz.gov.cn/"))
        self.assertFalse(source_is_official("https://stats.gov.cn.evil.com/"))

    def test_number(self):
        self.assertEqual(number("1,234.50"), 1234.5)
        self.assertIsNone(number("..."))

    def test_api_requires_period_and_numeric_value(self):
        payload = {
            "data": [
                {"code": "202608MM", "values": [
                    {"_id": METRIC["code"].split(":")[1], "value": "4.2"},
                    {"_id": "another-id", "value": "50.0"},
                ]},
                {"code": "202609MM", "values": [{"value": None}]},
            ]
        }
        rows = parse_api_response(payload, METRIC, "2026-10-14T12:00:00+08:00")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["period"], "2026-08")
        self.assertEqual(rows[0]["value"], 4.2)
        self.assertIsNone(rows[0]["official_release_date"])

    def test_versions_preserved(self):
        base = {"indicator_id": "retail", "period": "2026-08", "value": 2.1,
                "retrieved_at": "2026-09-15", "official_release_date": None}
        archive, changes = merge_records([], [base])
        self.assertEqual(changes, 1)
        archive, changes = merge_records(archive, [dict(base)])
        self.assertEqual(changes, 0)
        revised = dict(base, value=2.3, retrieved_at="2026-10-14")
        archive, changes = merge_records(archive, [revised])
        self.assertEqual(changes, 1)
        self.assertEqual([a["value"] for a in archive], [2.1, 2.3])
        self.assertEqual([a["version"] for a in archive], [1, 2])


if __name__ == "__main__":
    unittest.main()
