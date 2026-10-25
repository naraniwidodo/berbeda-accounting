"""P&L and Balance Sheet, derived from the journal.

Structure follows the "PLBS Consultant" layout of the source workbook:
monthly columns plus a year-to-date column, expenses shown negative, Gross
Profit and EBITDA as subtotals.

Nothing is stored. Both statements are a query over the entries, and cancelled
entries are excluded, so a cancellation changes the statements without leaving
a correcting figure behind.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from engine import ACCOUNTS

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

Series = list[int]          # 12 months + [12] = year to date
RowKind = Literal["section", "detail", "subtotal", "total", "spacer"]


class Row(TypedDict, total=False):
    kind: RowKind
    label: str
    values: Series


def _zero() -> Series:
    return [0] * 13


def _add(a: Series, b: Series) -> Series:
    return [x + y for x, y in zip(a, b)]


def _neg(a: Series) -> Series:
    return [-x for x in a]


def years_in(entries: list[dict[str, Any]]) -> list[int]:
    found = {int(e["date"][:4]) for e in entries if e["date"][:4].isdigit()}
    if not found:
        from datetime import date
        found = {date.today().year}
    return sorted(found, reverse=True)


def _movements(entries: list[dict[str, Any]], year: int):
    """Signed movement per account and per account+detail, bucketed by month.

    Debit-normal accounts are positive on debit, credit-normal on credit.
    """
    by_account: dict[str, Series] = {}
    by_detail: dict[str, dict[str, Series]] = {}

    for e in entries:
        if e.get("cancelled"):
            continue
        if not e["date"][:4].isdigit() or int(e["date"][:4]) != year:
            continue
        month = int(e["date"][5:7]) - 1
        if not 0 <= month <= 11:
            continue

        for ln in e["lines"]:
            account = ACCOUNTS.get(ln["account"])
            if account is None:
                continue
            signed = (1 if ln["side"] == account["normal"] else -1) * ln["amount"]

            series = by_account.setdefault(ln["account"], _zero())
            series[month] += signed
            series[12] += signed

            detail = ln.get("detail") or "—"
            d = by_detail.setdefault(ln["account"], {}).setdefault(detail, _zero())
            d[month] += signed
            d[12] += signed

    return by_account, by_detail


EXPENSE_GROUPS = ["COGS", "S&D", "Marketing", "OPEX"]


def profit_and_loss(entries: list[dict[str, Any]], year: int) -> dict[str, Any]:
    by_account, by_detail = _movements(entries, year)
    rows: list[Row] = []

    revenue = by_account.get("Revenue", _zero())
    rows.append({"kind": "section", "label": "Revenue", "values": revenue})
    for detail, series in by_detail.get("Revenue", {}).items():
        rows.append({"kind": "detail", "label": detail, "values": series})

    expense = {g: _neg(by_account.get(g, _zero())) for g in EXPENSE_GROUPS}

    cogs = expense["COGS"]
    rows.append({"kind": "section", "label": "COGS", "values": cogs})
    for detail, series in by_detail.get("COGS", {}).items():
        rows.append({"kind": "detail", "label": detail, "values": _neg(series)})

    gross_profit = _add(revenue, cogs)
    rows.append({"kind": "subtotal", "label": "Gross Profit", "values": gross_profit})
    rows.append({"kind": "spacer", "label": ""})

    below = _zero()
    for group in EXPENSE_GROUPS[1:]:
        series = expense[group]
        below = _add(below, series)
        rows.append({"kind": "section", "label": group, "values": series})
        for detail, d in by_detail.get(group, {}).items():
            rows.append({"kind": "detail", "label": detail, "values": _neg(d)})

    ebitda = _add(gross_profit, below)
    rows.append({"kind": "subtotal", "label": "EBITDA", "values": ebitda})

    depreciation = _zero()
    rows.append({"kind": "detail", "label": "Depreciation", "values": depreciation})
    net_income = _add(ebitda, depreciation)
    rows.append({"kind": "total", "label": "EBIT", "values": net_income})

    return {"rows": rows, "netIncome": net_income, "year": year, "months": MONTHS}


BS_GROUPS: list[tuple[str, str]] = [
    ("Asset", "Asset"),
    ("Liability", "Liability"),
    ("Equity", "Equity"),
]


def balance_sheet(entries: list[dict[str, Any]], year: int) -> dict[str, Any]:
    """Closing balances, cumulative through each month.

    Net income flows into Retained Earnings, so this and the P&L always
    describe the same period without a separate closing entry.
    """
    by_account, _ = _movements(entries, year)
    net_income = profit_and_loss(entries, year)["netIncome"]

    def cumulative(series: Series) -> Series:
        out = _zero()
        running = 0
        for i in range(12):
            running += series[i]
            out[i] = running
        out[12] = running
        return out

    rows: list[Row] = []
    assets = _zero()
    liab_equity = _zero()

    for acct_type, label in BS_GROUPS:
        group_total = _zero()
        group_rows: list[Row] = []

        for code, account in ACCOUNTS.items():
            if account["type"] != acct_type:
                continue
            is_re = code == "RE"
            values = cumulative(net_income) if is_re else cumulative(by_account.get(code, _zero()))
            if not is_re and all(v == 0 for v in values):
                continue
            group_total = _add(group_total, values)
            group_rows.append({"kind": "detail", "label": code, "values": values})

        rows.append({"kind": "section", "label": label, "values": group_total})
        rows.extend(group_rows)
        rows.append({"kind": "spacer", "label": ""})

        if acct_type == "Asset":
            assets = group_total
        else:
            liab_equity = _add(liab_equity, group_total)

    rows.append({"kind": "subtotal", "label": "Total Assets", "values": assets})
    rows.append({"kind": "total", "label": "Total Liabilities + Equity", "values": liab_equity})

    return {
        "rows": rows,
        "assets": assets,
        "liabilitiesAndEquity": liab_equity,
        "balanced": [abs(a - b) < 1 for a, b in zip(assets, liab_equity)],
        "year": year,
        "months": MONTHS,
    }
