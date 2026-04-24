import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.importer import import_csv_bytes


SAMPLE_CSV = """約定日,受渡日,銘柄コード,銘柄名,口座,信用区分,取引,数量[株],売却/決済単価[円],売却/決済額[円],平均取得価額[円],実現損益[円]
"2026/04/23","2026/04/25","1111","テスト銘柄A","特定","-","売付","100","1,234.5","123,450","1,200.00","3,450"
"2026/04/24","2026/04/28","2222","テスト銘柄B","NISA成長投資枠","制度","売埋","200","987.6","197,520","1,000.00","-2,480"
"""


class ImporterTest(unittest.TestCase):
    def test_import_csv_bytes_rebuilds_database(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "sample.sqlite3"

            summary = import_csv_bytes(SAMPLE_CSV.encode("cp932"), db_path, "sample.csv")

            self.assertEqual(summary["source_file"], "sample.csv")
            self.assertEqual(summary["row_count"], 2)
            self.assertEqual(summary["execution_date_min"], "2026-04-23")
            self.assertEqual(summary["execution_date_max"], "2026-04-24")
            self.assertEqual(summary["total_realized_pl_yen"], 970)

            with sqlite3.connect(db_path) as conn:
                count = conn.execute("SELECT COUNT(*) FROM realized_pl").fetchone()[0]
                total = conn.execute("SELECT SUM(realized_pl_yen) FROM realized_pl").fetchone()[0]
                history = conn.execute(
                    "SELECT source_file, row_count, total_realized_pl_yen FROM import_history"
                ).fetchone()

            self.assertEqual(count, 2)
            self.assertEqual(total, 970)
            self.assertEqual(history, ("sample.csv", 2, 970))


if __name__ == "__main__":
    unittest.main()
