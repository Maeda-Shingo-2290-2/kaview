import unittest
from pathlib import Path
import sqlite3

from app.server import KaviewAPI


DB_PATH = Path("/home/shingo/data/realized_pl_jp_20260423_183041.sqlite3")


@unittest.skipUnless(DB_PATH.exists(), "realized PL database is not available")
class KaviewAPITest(unittest.TestCase):
    def setUp(self):
        self.api = KaviewAPI(DB_PATH)

    def current_db_totals(self):
        with sqlite3.connect(DB_PATH) as conn:
            return conn.execute(
                """
                SELECT COUNT(*), SUM(realized_pl_yen), MIN(execution_date), MAX(execution_date)
                FROM realized_pl
                """
            ).fetchone()

    def test_summary_matches_imported_database(self):
        summary = self.api.summary({})
        row_count, total_realized_pl_yen, min_date, max_date = self.current_db_totals()

        self.assertEqual(summary["trade_count"], row_count)
        self.assertEqual(summary["total_realized_pl_yen"], total_realized_pl_yen)
        self.assertEqual(summary["from_date"], min_date)
        self.assertEqual(summary["to_date"], max_date)

    def test_monthly_timeseries_has_cumulative_values(self):
        data = self.api.timeseries({"group_by": "month"})

        self.assertEqual(data["group_by"], "month")
        self.assertGreater(len(data["items"]), 0)
        self.assertIn("cumulative_realized_pl_yen", data["items"][0])

    def test_security_and_trade_endpoints_page_results(self):
        securities = self.api.by_security({"limit": "5"})
        trades = self.api.trades({"limit": "5"})
        row_count, *_ = self.current_db_totals()

        self.assertEqual(len(securities["items"]), 5)
        self.assertGreater(securities["total"], 0)
        self.assertEqual(len(trades["items"]), 5)
        self.assertEqual(trades["total"], row_count)


if __name__ == "__main__":
    unittest.main()
