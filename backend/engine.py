"""Posting rules engine.

Turns a template choice plus a few numbers into balanced journal lines.
No storage, no framework - just the posting logic from
output/transaction_template.md.

The chart of accounts and the templates are read from the project root, which
is the single source of truth for both this and the TypeScript port the front
end runs (web/src/lib/engine.ts). Only the ~100 lines of evaluation below are
duplicated across the two languages; the rules themselves are not.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHART = json.loads((ROOT / "accounts.json").read_text())
TEMPLATES = {t["id"]: t for t in json.loads((ROOT / "templates.json").read_text())["templates"]}

ACCOUNTS = {a["code"]: a for a in CHART["accounts"]}
SETTLEMENT = CHART["settlement"]


class PostingError(ValueError):
    """Raised when a template cannot be rendered into a valid entry."""


def _amount(expr: str, values: dict[str, int]) -> int:
    """Evaluate a simple '+'/'-' expression over the supplied values."""
    total, sign = 0, 1
    for token in re.split(r"\s*([+-])\s*", expr.strip()):
        if token == "+":
            sign = 1
        elif token == "-":
            sign = -1
        elif token:
            if token not in values:
                raise PostingError(f"missing value: {token!r}")
            total += sign * values[token]
    return total


def render(template_id, values, settlement=None, detail=None, sku=None):
    """Build journal lines for a template. Returns (lines, warnings)."""
    tpl = TEMPLATES.get(template_id)
    if tpl is None:
        raise PostingError(f"unknown template: {template_id!r}")
    if tpl.get("manual"):
        raise PostingError("F1 is a manual entry - supply lines directly")

    required = [i["name"] for i in tpl.get("inputs", [])]
    required += [c["name"] for c in tpl.get("context", [])]
    for name in required:
        if name not in values:
            raise PostingError(f"{template_id} needs {name!r}")

    if tpl.get("settlement"):
        if settlement is None:
            raise PostingError(f"{template_id} needs a settlement mode {tpl['settlement']}")
        if settlement not in tpl["settlement"]:
            raise PostingError(f"{settlement!r} not allowed for {template_id}")

    detail = detail or tpl.get("detail_default")
    warnings = []
    lines = []

    for spec in tpl["lines"]:
        account = spec["account"]
        if account == "@settlement":
            account = SETTLEMENT[settlement]["account"]

        line_detail = spec.get("detail", detail)
        allowed = ACCOUNTS[account]["details"]
        if allowed and line_detail not in allowed:
            line_detail = allowed[0]
            warnings.append(f"{account}: detail reset to {line_detail!r}")
        elif not allowed:
            line_detail = None

        lines.append({
            "side": spec["side"],
            "account": account,
            "detail": line_detail,
            "amount": _amount(spec["amount"], values),
            "auto": spec.get("auto", False),
            "sku": sku,
        })

    validate(lines)
    return lines, warnings


def validate(lines):
    """Raise unless the lines form a legal double-entry record."""
    if not lines:
        raise PostingError("entry has no lines")

    for ln in lines:
        if ln["account"] not in ACCOUNTS:
            raise PostingError(f"unknown account: {ln['account']!r}")
        if ln["side"] not in ("Dr", "Cr"):
            raise PostingError(f"bad side: {ln['side']!r}")
        if ln["amount"] <= 0:
            raise PostingError(f"{ln['account']}: amount must be positive, got {ln['amount']}")
        allowed = ACCOUNTS[ln["account"]]["details"]
        if allowed and ln["detail"] not in allowed:
            raise PostingError(f"{ln['account']}: invalid detail {ln['detail']!r}")

    dr = sum(l["amount"] for l in lines if l["side"] == "Dr")
    cr = sum(l["amount"] for l in lines if l["side"] == "Cr")
    if dr != cr:
        raise PostingError(f"out of balance: Dr {dr:,} vs Cr {cr:,} (diff {dr - cr:,})")
    return True


def show(lines):
    out = []
    for ln in lines:
        pad = "" if ln["side"] == "Dr" else "    "
        tag = "  [auto]" if ln["auto"] else ""
        det = f" / {ln['detail']}" if ln["detail"] else ""
        out.append(f"  {pad}{ln['side']}  {ln['account']+det:<40} {ln['amount']:>14,}{tag}")
    return "\n".join(out)


if __name__ == "__main__":
    SAMPLE = {"amount": 124_000, "gross": 5_000_000, "tax": 250_000,
              "cash_received": 700_000, "dp_open": 300_000,
              "dp_amount": 300_000, "project_value": 1_000_000}

    print(f"{len(ACCOUNTS)} accounts  |  {len(TEMPLATES)} templates\n")
    failed = 0
    for tid, tpl in TEMPLATES.items():
        if tpl.get("manual"):
            print(f"{tid}  {tpl['label']} - manual, skipped\n")
            continue
        modes = tpl.get("settlement") or [None]
        for mode in modes:
            label = f"{tid}  {tpl['label']}" + (f"  [{SETTLEMENT[mode]['label']}]" if mode else "")
            try:
                lines, warn = render(tid, SAMPLE, settlement=mode)
                print(label)
                print(show(lines))
                for w in warn:
                    print(f"       ! {w}")
                print()
            except PostingError as exc:
                failed += 1
                print(f"{label}\n       FAILED: {exc}\n")
    print(f"{'all templates balance' if not failed else str(failed) + ' FAILED'}")
