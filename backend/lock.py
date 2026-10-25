"""Period lock.

One lock covers the period, not a statement. Net income flows from the P&L
into equity on the Balance Sheet, so freezing one and not the other would
leave them describing different periods - they close together or not at all.

The lock works by refusing to change a closed period rather than by
snapshotting figures: nothing dated on or before the lock can be posted, and
nothing already inside it can be cancelled. A closed month therefore cannot
drift, and no second copy of the numbers is kept.

Enforcement lives here and is called by the routes, so the rule holds for any
caller - not only the one web page that happens to grey out a button.
"""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from db import connect, now

ITERATIONS = 150_000
MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


class LockError(Exception):
    """Raised when an action is refused because its period is closed."""


def _derive(password: str, salt: bytes, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations).hex()


def state() -> dict[str, Any]:
    with connect() as con:
        row = con.execute("SELECT * FROM lock_state WHERE id = 1").fetchone()
        log = con.execute("SELECT at, action, period, note FROM lock_log ORDER BY id").fetchall()
    return {
        "lockedThrough": row["locked_through"],
        "hasPassword": row["hash"] is not None,
        "log": [dict(r) for r in log],
    }


def _log(con, action: str, period: str | None, note: str | None) -> None:
    con.execute(
        "INSERT INTO lock_log (at, action, period, note) VALUES (?, ?, ?, ?)",
        (now(), action, period, note),
    )


def set_password(password: str) -> None:
    salt = secrets.token_bytes(16)
    with connect() as con:
        con.execute(
            "UPDATE lock_state SET salt = ?, hash = ?, iterations = ? WHERE id = 1",
            (salt.hex(), _derive(password, salt, ITERATIONS), ITERATIONS),
        )
        _log(con, "set-password", None, None)


def verify(password: str) -> bool:
    with connect() as con:
        row = con.execute("SELECT salt, hash, iterations FROM lock_state WHERE id = 1").fetchone()
    if not row or not row["hash"]:
        return False
    candidate = _derive(password, bytes.fromhex(row["salt"]), row["iterations"])
    return secrets.compare_digest(candidate, row["hash"])


def lock_through(period: str, note: str | None = None) -> dict[str, Any]:
    with connect() as con:
        con.execute("UPDATE lock_state SET locked_through = ? WHERE id = 1", (period,))
        _log(con, "lock", period, note)
    return state()


def unlock(note: str | None = None) -> dict[str, Any]:
    """Clears the lock. The caller must have checked the password first."""
    with connect() as con:
        row = con.execute("SELECT locked_through FROM lock_state WHERE id = 1").fetchone()
        con.execute("UPDATE lock_state SET locked_through = NULL WHERE id = 1")
        _log(con, "unlock", row["locked_through"], note)
    return state()


def is_date_locked(date: str) -> bool:
    locked_through = state()["lockedThrough"]
    return bool(locked_through and date and date[:7] <= locked_through)


def period_label(period: str | None) -> str:
    if not period:
        return "—"
    year, month = period.split("-")
    return f"{MONTH_NAMES[int(month) - 1]} {year}"


def guard(date: str, action: str) -> None:
    """Refuse an action that would change a closed period."""
    if is_date_locked(date):
        closed = period_label(state()["lockedThrough"])
        raise LockError(
            f"{closed} and earlier is closed. An entry dated {date} cannot be {action}. "
            f"Unlock the period first."
        )
