"""SQLite store for the journal and the period lock.

Two rules are enforced here rather than in a route, so they hold no matter
which caller asks:

  * the journal is append-only - nothing is ever deleted, and cancelling an
    entry sets `voided_at` instead;
  * transaction numbers are assigned inside the insert transaction, counting
    cancelled entries too, so a number can never be handed out twice.
"""

from __future__ import annotations

import sqlite3
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

DB_PATH = Path(__file__).resolve().parent / "berbeda.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id             TEXT PRIMARY KEY,
    date           TEXT NOT NULL,
    transaction_no TEXT NOT NULL UNIQUE,
    template_id    TEXT NOT NULL,
    template_label TEXT NOT NULL,
    sku            TEXT NOT NULL DEFAULT '',
    settlement     TEXT,
    detail         TEXT,
    note           TEXT,
    created_at     TEXT NOT NULL,
    voided_at      TEXT,
    void_reason    TEXT,
    invoice_no     TEXT,
    payment_source TEXT
);

CREATE TABLE IF NOT EXISTS lines (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id  TEXT NOT NULL REFERENCES entries(id),
    idx       INTEGER NOT NULL,
    side      TEXT NOT NULL CHECK (side IN ('Dr', 'Cr')),
    account   TEXT NOT NULL,
    detail    TEXT,
    amount    INTEGER NOT NULL CHECK (amount > 0),
    auto      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS lines_entry ON lines(entry_id);
CREATE INDEX IF NOT EXISTS entries_date ON entries(date);

CREATE TABLE IF NOT EXISTS clients (
    sku         TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    project     TEXT NOT NULL DEFAULT '',
    dp_date     TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lock_state (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    locked_through TEXT,
    salt           TEXT,
    hash           TEXT,
    iterations     INTEGER
);

CREATE TABLE IF NOT EXISTS lock_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL,
    action TEXT NOT NULL,
    period TEXT,
    note   TEXT
);

INSERT OR IGNORE INTO lock_state (id, locked_through) VALUES (1, NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


#: Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
#: EXISTS", so each is checked against the table before being added - that way
#: a database created before the column existed is brought forward rather than
#: having to be thrown away.
LATER_COLUMNS = [
    ("entries", "invoice_no", "TEXT"),
    ("entries", "payment_source", "TEXT"),
]


def init() -> None:
    with connect() as con:
        con.executescript(SCHEMA)
        for table, column, kind in LATER_COLUMNS:
            existing = {r["name"] for r in con.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")


# ── journal ───────────────────────────────────────────────────────────────

REGISTER_PREFIX = {"A": "SPM", "B": "NSPB", "C": "NSPB", "D": "ART", "E": "NSPM"}


def prefix_for(template_id: str) -> str:
    return REGISTER_PREFIX.get(template_id[:1].upper(), "GEN")


def next_transaction_no(con: sqlite3.Connection, prefix: str) -> str:
    """Highest number seen for this register, plus one.

    Counts cancelled entries, so a cancelled SPM02 still leaves SPM03 next -
    the gap is the record that something was posted there and withdrawn.
    """
    rows = con.execute(
        "SELECT transaction_no FROM entries WHERE transaction_no LIKE ?", (f"{prefix}%",)
    ).fetchall()
    highest = 0
    for r in rows:
        tail = r["transaction_no"][len(prefix):]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return f"{prefix}{highest + 1:02d}"


def peek_next_transaction_no(template_id: str) -> str:
    with connect() as con:
        return next_transaction_no(con, prefix_for(template_id))


def insert_entry(
    *,
    date: str,
    template_id: str,
    template_label: str,
    lines: list[dict[str, Any]],
    sku: str = "",
    settlement: str | None = None,
    detail: str | None = None,
    note: str | None = None,
    invoice_no: str | None = None,
    payment_source: str | None = None,
) -> dict[str, Any]:
    entry_id = f"JE{secrets.token_hex(5).upper()}"
    with connect() as con:
        transaction_no = next_transaction_no(con, prefix_for(template_id))
        con.execute(
            """INSERT INTO entries
               (id, date, transaction_no, template_id, template_label, sku,
                settlement, detail, note, created_at, invoice_no, payment_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entry_id, date, transaction_no, template_id, template_label, sku,
             settlement, detail, note, now(), invoice_no, payment_source),
        )
        for i, ln in enumerate(lines):
            con.execute(
                """INSERT INTO lines (entry_id, idx, side, account, detail, amount, auto)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (entry_id, i, ln["side"], ln["account"], ln.get("detail"),
                 int(ln["amount"]), 1 if ln.get("auto") else 0),
            )
    return get_entry(entry_id)  # type: ignore[return-value]


def _hydrate(con: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    entries = [dict(r) for r in rows]
    if not entries:
        return []
    ids = [e["id"] for e in entries]
    q = f"SELECT * FROM lines WHERE entry_id IN ({','.join('?' * len(ids))}) ORDER BY entry_id, idx"
    by_entry: dict[str, list[dict[str, Any]]] = {}
    for ln in con.execute(q, ids).fetchall():
        by_entry.setdefault(ln["entry_id"], []).append(
            {
                "side": ln["side"],
                "account": ln["account"],
                "detail": ln["detail"],
                "amount": ln["amount"],
                "auto": bool(ln["auto"]),
            }
        )
    for e in entries:
        e["lines"] = by_entry.get(e["id"], [])
        e["cancelled"] = e["voided_at"] is not None
    return entries


def list_entries() -> list[dict[str, Any]]:
    with connect() as con:
        rows = con.execute("SELECT * FROM entries ORDER BY date, created_at").fetchall()
        return _hydrate(con, rows)


def get_entry(entry_id: str) -> dict[str, Any] | None:
    with connect() as con:
        rows = con.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchall()
        got = _hydrate(con, rows)
        return got[0] if got else None


def cancel_entry(entry_id: str, reason: str) -> dict[str, Any] | None:
    """Mark an entry cancelled. The row and its number stay; only the effect goes."""
    with connect() as con:
        con.execute(
            "UPDATE entries SET voided_at = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL",
            (now(), reason, entry_id),
        )
    return get_entry(entry_id)


def live_entries() -> list[dict[str, Any]]:
    return [e for e in list_entries() if not e["cancelled"]]


# ── clients ───────────────────────────────────────────────────────────────


def list_clients() -> list[dict[str, Any]]:
    """Registered projects, newest first, each with its open deposit."""
    with connect() as con:
        rows = [dict(r) for r in con.execute(
            "SELECT * FROM clients ORDER BY created_at DESC"
        ).fetchall()]
    open_dp = open_prepayment()
    posted = {e["sku"] for e in list_entries() if e["sku"]}
    for c in rows:
        c["open_prepayment"] = open_dp.get(c["sku"], 0)
        c["has_entries"] = c["sku"] in posted
    return rows


def get_client(sku: str) -> dict[str, Any] | None:
    with connect() as con:
        row = con.execute("SELECT * FROM clients WHERE sku = ?", (sku,)).fetchone()
    return dict(row) if row else None


def insert_client(
    *, sku: str, client_name: str, project: str = "", dp_date: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    with connect() as con:
        con.execute(
            """INSERT INTO clients (sku, client_name, project, dp_date, note, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (sku, client_name, project, dp_date, note, now()),
        )
    return get_client(sku)  # type: ignore[return-value]


def update_client(
    sku: str, *, client_name: str, project: str = "", dp_date: str | None = None,
    note: str | None = None,
) -> dict[str, Any] | None:
    with connect() as con:
        con.execute(
            """UPDATE clients SET client_name = ?, project = ?, dp_date = ?, note = ?
               WHERE sku = ?""",
            (client_name, project, dp_date, note, sku),
        )
    return get_client(sku)


def delete_client(sku: str) -> bool:
    """Only while nothing has been posted against it - a SKU with entries stays.

    Removing one would leave journal rows pointing at a project that no longer
    exists, which is the sort of dangling reference this app exists to avoid.
    """
    if any(e["sku"] == sku for e in list_entries()):
        return False
    with connect() as con:
        con.execute("DELETE FROM clients WHERE sku = ?", (sku,))
    return True


def open_prepayment() -> dict[str, int]:
    """Down payments received and not yet cleared, by SKU."""
    open_by_sku: dict[str, int] = {}
    for e in live_entries():
        if not e["sku"]:
            continue
        for ln in e["lines"]:
            if ln["account"] != "Prepayment Client":
                continue
            delta = ln["amount"] if ln["side"] == "Cr" else -ln["amount"]
            open_by_sku[e["sku"]] = open_by_sku.get(e["sku"], 0) + delta
    return {k: v for k, v in open_by_sku.items() if v > 0}
