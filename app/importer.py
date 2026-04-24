from __future__ import annotations

import csv
import os
import sqlite3
import tempfile
from datetime import datetime
from io import BytesIO, TextIOWrapper
from pathlib import Path
from typing import BinaryIO


EXPECTED_HEADERS = [
    "約定日",
    "受渡日",
    "銘柄コード",
    "銘柄名",
    "口座",
    "信用区分",
    "取引",
    "数量[株]",
    "売却/決済単価[円]",
    "売却/決済額[円]",
    "平均取得価額[円]",
    "実現損益[円]",
]


def parse_date(value: str) -> str | None:
    value = value.strip()
    return datetime.strptime(value, "%Y/%m/%d").date().isoformat() if value else None


def parse_int(value: str) -> int | None:
    cleaned = value.strip().replace(",", "")
    return int(cleaned) if cleaned else None


def parse_float(value: str) -> float | None:
    cleaned = value.strip().replace(",", "")
    return float(cleaned) if cleaned else None


def read_csv_rows(stream: BinaryIO, source_name: str) -> list[tuple]:
    text_stream = TextIOWrapper(stream, encoding="cp932", newline="")
    try:
        reader = csv.DictReader(text_stream)
        if reader.fieldnames != EXPECTED_HEADERS:
            raise ValueError(f"Unexpected CSV headers: {reader.fieldnames!r}")

        rows = []
        for row in reader:
            if not any((value or "").strip() for value in row.values()):
                continue
            rows.append(
                (
                    parse_date(row["約定日"]),
                    parse_date(row["受渡日"]),
                    row["銘柄コード"].strip(),
                    row["銘柄名"].strip(),
                    row["口座"].strip(),
                    row["信用区分"].strip(),
                    row["取引"].strip(),
                    parse_int(row["数量[株]"]),
                    parse_float(row["売却/決済単価[円]"]),
                    parse_int(row["売却/決済額[円]"]),
                    parse_float(row["平均取得価額[円]"]),
                    parse_int(row["実現損益[円]"]),
                    source_name,
                )
            )
    finally:
        text_stream.detach()

    if not rows:
        raise ValueError("CSVに取引データがありません")
    return rows


def initialize_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE realized_pl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_date TEXT NOT NULL,
            settlement_date TEXT NOT NULL,
            security_code TEXT NOT NULL,
            security_name TEXT NOT NULL,
            account TEXT NOT NULL,
            margin_type TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            quantity_shares INTEGER,
            sale_settlement_unit_price_yen REAL,
            sale_settlement_amount_yen INTEGER,
            average_acquisition_price_yen REAL,
            realized_pl_yen INTEGER,
            source_file TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            source_file TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            execution_date_min TEXT,
            execution_date_max TEXT,
            total_realized_pl_yen INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX idx_realized_pl_execution_date ON realized_pl(execution_date)")
    conn.execute("CREATE INDEX idx_realized_pl_security_code ON realized_pl(security_code)")
    conn.execute("CREATE INDEX idx_realized_pl_account ON realized_pl(account)")
    conn.execute("CREATE INDEX idx_realized_pl_transaction_type ON realized_pl(transaction_type)")
    conn.execute(
        """
        CREATE VIEW realized_pl_summary_by_date AS
        SELECT
            execution_date,
            COUNT(*) AS trade_count,
            SUM(quantity_shares) AS total_quantity_shares,
            SUM(sale_settlement_amount_yen) AS total_sale_settlement_amount_yen,
            SUM(realized_pl_yen) AS total_realized_pl_yen
        FROM realized_pl
        GROUP BY execution_date
        """
    )
    conn.execute(
        """
        CREATE VIEW realized_pl_summary_by_security AS
        SELECT
            security_code,
            security_name,
            COUNT(*) AS trade_count,
            SUM(quantity_shares) AS total_quantity_shares,
            SUM(sale_settlement_amount_yen) AS total_sale_settlement_amount_yen,
            SUM(realized_pl_yen) AS total_realized_pl_yen
        FROM realized_pl
        GROUP BY security_code, security_name
        """
    )


def build_database(db_path: Path, rows: list[tuple], source_name: str) -> dict:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=db_path.stem + ".", suffix=".tmp", dir=db_path.parent, delete=False) as temp:
        temp_path = Path(temp.name)

    try:
        with sqlite3.connect(temp_path) as conn:
            initialize_schema(conn)
            conn.executemany(
                """
                INSERT INTO realized_pl (
                    execution_date,
                    settlement_date,
                    security_code,
                    security_name,
                    account,
                    margin_type,
                    transaction_type,
                    quantity_shares,
                    sale_settlement_unit_price_yen,
                    sale_settlement_amount_yen,
                    average_acquisition_price_yen,
                    realized_pl_yen,
                    source_file
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

            summary = conn.execute(
                """
                SELECT
                    COUNT(*) AS row_count,
                    MIN(execution_date) AS execution_date_min,
                    MAX(execution_date) AS execution_date_max,
                    SUM(realized_pl_yen) AS total_realized_pl_yen
                FROM realized_pl
                """
            ).fetchone()
            conn.execute(
                """
                INSERT INTO import_history (
                    source_file,
                    row_count,
                    execution_date_min,
                    execution_date_max,
                    total_realized_pl_yen
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    source_name,
                    summary[0],
                    summary[1],
                    summary[2],
                    summary[3],
                ),
            )
            conn.commit()

        os.replace(temp_path, db_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise

    return {
        "source_file": source_name,
        "row_count": summary[0],
        "execution_date_min": summary[1],
        "execution_date_max": summary[2],
        "total_realized_pl_yen": summary[3],
    }


def import_csv_bytes(data: bytes, db_path: Path, source_name: str) -> dict:
    rows = read_csv_rows(BytesIO(data), source_name)
    return build_database(db_path, rows, source_name)
