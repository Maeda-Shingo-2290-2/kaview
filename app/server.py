from __future__ import annotations

import argparse
import cgi
import json
import mimetypes
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    from app.importer import import_csv_bytes
except ModuleNotFoundError:
    from importer import import_csv_bytes

ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT_DIR / "dist"
LEGACY_STATIC_DIR = ROOT_DIR / "web"
DEFAULT_DB_PATH = Path("/home/shingo/data/realized_pl_jp_20260423_183041.sqlite3")

ALLOWED_SORTS = {
    "trades": {
        "execution_date",
        "settlement_date",
        "security_code",
        "security_name",
        "account",
        "margin_type",
        "transaction_type",
        "quantity_shares",
        "sale_settlement_unit_price_yen",
        "sale_settlement_amount_yen",
        "average_acquisition_price_yen",
        "realized_pl_yen",
    },
    "by_security": {
        "security_code",
        "security_name",
        "trade_count",
        "total_realized_pl_yen",
        "win_rate",
        "average_pl_yen",
        "max_win_yen",
        "max_loss_yen",
        "total_sale_settlement_amount_yen",
        "total_quantity_shares",
    },
}

BY_SECURITY_SORT_SQL = {
    "security_code": "security_code",
    "security_name": "security_name",
    "trade_count": "trade_count",
    "total_realized_pl_yen": "total_realized_pl_yen",
    "win_rate": "CAST(win_count AS REAL) / NULLIF(win_count + loss_count, 0)",
    "average_pl_yen": "average_pl_yen",
    "max_win_yen": "max_win_yen",
    "max_loss_yen": "max_loss_yen",
    "total_sale_settlement_amount_yen": "total_sale_settlement_amount_yen",
    "total_quantity_shares": "total_quantity_shares",
}


def dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict[str, Any]:
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def parse_query(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    parsed = urlparse(handler.path)
    raw = parse_qs(parsed.query, keep_blank_values=False)
    return {key: values[-1] for key, values in raw.items() if values}


def positive_int(value: str | None, default: int, maximum: int) -> int:
    try:
        parsed = int(value) if value is not None else default
    except ValueError:
        return default
    return max(0, min(parsed, maximum))


def build_filters(params: dict[str, str]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    values: list[Any] = []

    if params.get("from"):
        clauses.append("execution_date >= ?")
        values.append(params["from"])
    if params.get("to"):
        clauses.append("execution_date <= ?")
        values.append(params["to"])
    if params.get("q"):
        clauses.append("(security_code LIKE ? OR security_name LIKE ?)")
        q = f"%{params['q']}%"
        values.extend([q, q])
    if params.get("account"):
        clauses.append("account = ?")
        values.append(params["account"])
    if params.get("margin_type"):
        clauses.append("margin_type = ?")
        values.append(params["margin_type"])
    if params.get("transaction_type"):
        clauses.append("transaction_type = ?")
        values.append(params["transaction_type"])

    pl_type = params.get("pl_type")
    if pl_type == "profit":
        clauses.append("realized_pl_yen > 0")
    elif pl_type == "loss":
        clauses.append("realized_pl_yen < 0")
    elif pl_type == "flat":
        clauses.append("realized_pl_yen = 0")

    if not clauses:
        return "", values
    return " WHERE " + " AND ".join(clauses), values


def safe_order(value: str | None) -> str:
    return "ASC" if value == "asc" else "DESC"


class KaviewAPI:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.import_lock = Lock()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = dict_factory
        return conn

    def filters(self) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT MIN(execution_date) AS min, MAX(execution_date) AS max FROM realized_pl"
            ).fetchone()
            return {
                "date_range": row,
                "accounts": self._distinct(conn, "account"),
                "margin_types": self._distinct(conn, "margin_type"),
                "transaction_types": self._distinct(conn, "transaction_type"),
            }

    def summary(self, params: dict[str, str]) -> dict[str, Any]:
        where_sql, values = build_filters(params)
        sql = f"""
            SELECT
                COUNT(*) AS trade_count,
                COALESCE(SUM(realized_pl_yen), 0) AS total_realized_pl_yen,
                COALESCE(SUM(CASE WHEN realized_pl_yen > 0 THEN 1 ELSE 0 END), 0) AS win_count,
                COALESCE(SUM(CASE WHEN realized_pl_yen < 0 THEN 1 ELSE 0 END), 0) AS loss_count,
                COALESCE(SUM(CASE WHEN realized_pl_yen = 0 THEN 1 ELSE 0 END), 0) AS flat_count,
                COALESCE(SUM(CASE WHEN realized_pl_yen > 0 THEN realized_pl_yen ELSE 0 END), 0) AS gross_profit_yen,
                COALESCE(SUM(CASE WHEN realized_pl_yen < 0 THEN realized_pl_yen ELSE 0 END), 0) AS gross_loss_yen,
                AVG(realized_pl_yen) AS average_pl_yen,
                AVG(CASE WHEN realized_pl_yen > 0 THEN realized_pl_yen END) AS average_win_yen,
                AVG(CASE WHEN realized_pl_yen < 0 THEN realized_pl_yen END) AS average_loss_yen,
                MAX(realized_pl_yen) AS max_win_yen,
                MIN(realized_pl_yen) AS max_loss_yen,
                MIN(execution_date) AS from_date,
                MAX(execution_date) AS to_date
            FROM realized_pl
            {where_sql}
        """
        with self.connect() as conn:
            row = conn.execute(sql, values).fetchone()

        active_count = (row["win_count"] or 0) + (row["loss_count"] or 0)
        row["win_rate"] = (row["win_count"] / active_count) if active_count else None
        gross_loss = abs(row["gross_loss_yen"] or 0)
        row["profit_factor"] = (row["gross_profit_yen"] / gross_loss) if gross_loss else None
        return row

    def timeseries(self, params: dict[str, str]) -> dict[str, Any]:
        group_by = params.get("group_by", "day")
        period_expr = "substr(execution_date, 1, 7)" if group_by == "month" else "execution_date"
        normalized_group = "month" if group_by == "month" else "day"
        where_sql, values = build_filters(params)
        sql = f"""
            SELECT
                {period_expr} AS period,
                COUNT(*) AS trade_count,
                COALESCE(SUM(realized_pl_yen), 0) AS realized_pl_yen,
                COALESCE(SUM(CASE WHEN realized_pl_yen > 0 THEN 1 ELSE 0 END), 0) AS win_count,
                COALESCE(SUM(CASE WHEN realized_pl_yen < 0 THEN 1 ELSE 0 END), 0) AS loss_count
            FROM realized_pl
            {where_sql}
            GROUP BY period
            ORDER BY period ASC
        """
        with self.connect() as conn:
            items = conn.execute(sql, values).fetchall()

        cumulative = 0
        for item in items:
            cumulative += item["realized_pl_yen"] or 0
            item["cumulative_realized_pl_yen"] = cumulative
        return {"group_by": normalized_group, "items": items}

    def by_security(self, params: dict[str, str]) -> dict[str, Any]:
        where_sql, values = build_filters(params)
        sort = params.get("sort", "total_realized_pl_yen")
        if sort not in ALLOWED_SORTS["by_security"]:
            sort = "total_realized_pl_yen"
        sort_sql = BY_SECURITY_SORT_SQL[sort]
        order = safe_order(params.get("order"))
        limit = positive_int(params.get("limit"), 100, 500)
        offset = positive_int(params.get("offset"), 0, 100_000)

        base_sql = f"""
            FROM realized_pl
            {where_sql}
            GROUP BY security_code, security_name
        """
        item_sql = f"""
            SELECT
                security_code,
                security_name,
                COUNT(*) AS trade_count,
                COALESCE(SUM(realized_pl_yen), 0) AS total_realized_pl_yen,
                COALESCE(SUM(CASE WHEN realized_pl_yen > 0 THEN 1 ELSE 0 END), 0) AS win_count,
                COALESCE(SUM(CASE WHEN realized_pl_yen < 0 THEN 1 ELSE 0 END), 0) AS loss_count,
                AVG(realized_pl_yen) AS average_pl_yen,
                MAX(realized_pl_yen) AS max_win_yen,
                MIN(realized_pl_yen) AS max_loss_yen,
                COALESCE(SUM(sale_settlement_amount_yen), 0) AS total_sale_settlement_amount_yen,
                COALESCE(SUM(quantity_shares), 0) AS total_quantity_shares
            {base_sql}
            ORDER BY {sort_sql} {order}, security_code ASC
            LIMIT ? OFFSET ?
        """
        count_sql = f"SELECT COUNT(*) AS total FROM (SELECT security_code, security_name {base_sql})"

        with self.connect() as conn:
            items = conn.execute(item_sql, values + [limit, offset]).fetchall()
            total = conn.execute(count_sql, values).fetchone()["total"]

        for item in items:
            active_count = (item["win_count"] or 0) + (item["loss_count"] or 0)
            item["win_rate"] = (item["win_count"] / active_count) if active_count else None
        return {"items": items, "total": total}

    def trades(self, params: dict[str, str]) -> dict[str, Any]:
        where_sql, values = build_filters(params)
        sort = params.get("sort", "execution_date")
        if sort not in ALLOWED_SORTS["trades"]:
            sort = "execution_date"
        order = safe_order(params.get("order"))
        limit = positive_int(params.get("limit"), 100, 500)
        offset = positive_int(params.get("offset"), 0, 100_000)

        sql = f"""
            SELECT
                id,
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
                realized_pl_yen
            FROM realized_pl
            {where_sql}
            ORDER BY {sort} {order}, id DESC
            LIMIT ? OFFSET ?
        """
        count_sql = f"SELECT COUNT(*) AS total FROM realized_pl {where_sql}"
        with self.connect() as conn:
            items = conn.execute(sql, values + [limit, offset]).fetchall()
            total = conn.execute(count_sql, values).fetchone()["total"]
        return {"items": items, "total": total}

    def import_csv(self, filename: str, payload: bytes) -> dict[str, Any]:
        with self.import_lock:
            return import_csv_bytes(payload, self.db_path, filename)

    @staticmethod
    def _distinct(conn: sqlite3.Connection, column: str) -> list[str]:
        rows = conn.execute(
            f"SELECT DISTINCT {column} AS value FROM realized_pl ORDER BY {column} ASC"
        ).fetchall()
        return [row["value"] for row in rows if row["value"] is not None]


class KaviewHandler(BaseHTTPRequestHandler):
    api: KaviewAPI

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                self.handle_api(parsed.path, parse_query(self))
            else:
                self.handle_static(parsed.path, include_body=True)
        except Exception as exc:  # noqa: BLE001 - return JSON for local debugging
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                self.send_response(HTTPStatus.METHOD_NOT_ALLOWED)
                self.end_headers()
            else:
                self.handle_static(parsed.path, include_body=False)
        except Exception:
            self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/import":
                self.handle_import()
            else:
                self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001 - local app should surface errors
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_api(self, path: str, params: dict[str, str]) -> None:
        if path == "/api/filters":
            self.send_json(self.api.filters())
        elif path == "/api/summary":
            self.send_json(self.api.summary(params))
        elif path == "/api/pl/timeseries":
            self.send_json(self.api.timeseries(params))
        elif path == "/api/pl/by-security":
            self.send_json(self.api.by_security(params))
        elif path == "/api/trades":
            self.send_json(self.api.trades(params))
        else:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def handle_import(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise ValueError("multipart/form-data でCSVを送信してください")

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )
        upload = form["file"] if "file" in form else None
        if upload is None or not getattr(upload, "file", None):
            raise ValueError("CSVファイルが見つかりません")

        filename = Path(upload.filename or "uploaded.csv").name
        payload = upload.file.read()
        if not payload:
            raise ValueError("アップロードされたCSVが空です")

        result = self.api.import_csv(filename, payload)
        self.send_json(result, HTTPStatus.CREATED)

    def handle_static(self, path: str, include_body: bool) -> None:
        if path in ("", "/"):
            path = "/index.html"
        static_root = STATIC_DIR if STATIC_DIR.exists() else LEGACY_STATIC_DIR
        target = (static_root / path.lstrip("/")).resolve()
        if not str(target).startswith(str(static_root.resolve())) or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run kaview local web server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    if not args.db.exists():
        raise SystemExit(f"Database not found: {args.db}")

    if not STATIC_DIR.exists() and not LEGACY_STATIC_DIR.exists():
        raise SystemExit("Frontend assets not found. Run `npm run build` first.")

    KaviewHandler.api = KaviewAPI(args.db)
    server = ThreadingHTTPServer((args.host, args.port), KaviewHandler)
    print(f"kaview running on http://{args.host}:{args.port}")
    print(f"database: {args.db}")
    server.serve_forever()


if __name__ == "__main__":
    main()
