"""Tools available to the accounting helper.

Two kinds live here.

**Method** - `chart_of_accounts`, `posting_templates`, `explain_template`.
The firm's bookkeeping technique, already public in
`output/transaction_template.md`. These exist as tools rather than text pasted
into the prompt because a model that recalls "Prepaid Client" from memory has
invented an account, while a model that must call `chart_of_accounts()` gets
the real seventeen or nothing.

**Money** - `get_financial_report`. Real figures, read from the journal
through the same report code the P&L and Balance Sheet pages use, so the
helper and the pages can never disagree.

Every figure the helper is allowed to say must appear in a tool result: the
reply is checked against what the tools actually returned before it reaches
the browser (`agent.check_grounding`). A number that came from nowhere is
replaced, not shown.

---

**Adding another tool.** Two rules, both load-bearing:

1. If it returns real figures, add its name to `FINANCIAL_TOOLS` in
   `agent.py`. The grounding check reads that set.
2. **Never give the agent a tool that writes.** Posting, cancelling and the
   period lock stay on the pages where a person clicks them. The prompt says
   the helper does not change the books; a write tool would make that a
   promise the architecture does not keep.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic_ai import Agent

import db
import reports
from engine import ACCOUNTS, SETTLEMENT, TEMPLATES


# ── helpers ───────────────────────────────────────────────────────────────


def _index_and_label(year: int, month: int | None) -> tuple[int, str]:
    if month is None:
        return 12, f"{year} year to date"
    return month - 1, f"{reports.MONTHS[month - 1]} {year}"


def _has_entries(entries: list[dict[str, Any]], year: int) -> bool:
    return any(e["date"][:4] == str(year) and not e["cancelled"] for e in entries)


def _row(data: dict[str, Any], label: str, index: int) -> int:
    """A labelled figure out of a statement, or 0 if the line is absent."""
    for r in data["rows"]:
        if r["label"] == label and r.get("values"):
            return r["values"][index]
    return 0


def _ratio(numerator: float, denominator: float) -> float | None:
    """None when the denominator is zero - never a guess, never an infinity."""
    if not denominator:
        return None
    return round(numerator / denominator, 4)


def register(agent: Agent) -> Agent:
    """Attach the method-only tools to an agent."""

    @agent.tool_plain
    def chart_of_accounts() -> list[dict[str, Any]]:
        """The seventeen accounts Berbeda uses, with their type and normal balance.

        Call this before naming an account so the name is the real one.
        """
        return [
            {
                "account": code,
                "type": a["type"],
                "normal_balance": a["normal"],
                "details": a["details"],
            }
            for code, a in ACCOUNTS.items()
        ]

    @agent.tool_plain
    def posting_templates() -> list[dict[str, Any]]:
        """Every posting template, with the debits and credits each one makes.

        Use this to explain what an entry does, rather than reasoning it out
        from first principles and risking a different answer than the app.
        """
        out: list[dict[str, Any]] = []
        for t in TEMPLATES.values():
            if t.get("manual"):
                out.append({"id": t["id"], "label": t["label"], "manual": True})
                continue
            out.append(
                {
                    "id": t["id"],
                    "label": t["label"],
                    "group": t["group"],
                    "lines": [
                        {"side": ln["side"], "account": ln["account"], "amount": ln["amount"]}
                        for ln in t["lines"]
                    ],
                    "settlement_options": [
                        SETTLEMENT[m]["label"] for m in t.get("settlement", [])
                    ],
                }
            )
        return out

    @agent.tool_plain
    def explain_template(template_id: str) -> dict[str, Any]:
        """One template in full: what it is for, and the entry it writes.

        Args:
            template_id: e.g. "A4". Case-insensitive.
        """
        t = TEMPLATES.get(template_id.strip().upper())
        if t is None:
            return {
                "found": False,
                "message": f"No template {template_id!r}. Call posting_templates() for the list.",
            }
        return {
            "found": True,
            "id": t["id"],
            "label": t["label"],
            "group": t["group"],
            "requires_sku": t.get("sku") == "required",
            "lines": [
                {
                    "side": ln["side"],
                    "account": ln["account"],
                    "amount": ln["amount"],
                    "filled_automatically": bool(ln.get("auto")),
                    "note": ln.get("note"),
                }
                for ln in t.get("lines", [])
            ],
        }

    @agent.tool_plain
    def get_financial_report(
        statement: str,
        year: int,
        month: int | None = None,
    ) -> dict[str, Any]:
        """Real figures from Berbeda's books, for a period.

        This is the only way to learn an actual amount. Every figure you state
        must come from a result of this tool - if you have not called it, you
        do not know the number.

        Args:
            statement: "pnl" for the Profit & Loss, or "balance_sheet".
            year: the year, e.g. 2026.
            month: 1-12 for a single month, or omit for the whole year to date.

        Returns:
            The figures with their labels, in rupiah, plus which period they
            cover. An empty `figures` list means there are no entries for that
            period - say so, rather than reporting zeros as a result.
        """
        kind = statement.strip().lower().replace(" ", "_").replace("-", "_")
        if kind in {"pnl", "p&l", "profit_and_loss", "income_statement"}:
            kind = "pnl"
        elif kind in {"balance_sheet", "bs", "balancesheet"}:
            kind = "balance_sheet"
        else:
            return {
                "error": f"Unknown statement {statement!r}. Use 'pnl' or 'balance_sheet'.",
            }

        if month is not None and not 1 <= month <= 12:
            return {"error": f"month must be 1-12, got {month}"}

        entries = db.list_entries()
        index = 12 if month is None else month - 1
        period = f"{year} year to date" if month is None else f"{reports.MONTHS[index]} {year}"

        if not any(e["date"][:4] == str(year) and not e["cancelled"] for e in entries):
            return {
                "statement": kind,
                "period": period,
                "currency": "IDR",
                "figures": [],
                "note": f"No entries have been posted for {year}.",
            }

        data = (
            reports.profit_and_loss(entries, year)
            if kind == "pnl"
            else reports.balance_sheet(entries, year)
        )

        figures = [
            {"label": r["label"], "kind": r["kind"], "amount": r["values"][index]}
            for r in data["rows"]
            if r["kind"] != "spacer"
            and r.get("values")
            and (r["values"][index] != 0 or r["kind"] in {"subtotal", "total"})
        ]

        out: dict[str, Any] = {
            "statement": kind,
            "period": period,
            "currency": "IDR",
            "source": "P&L page" if kind == "pnl" else "Balance Sheet page",
            "figures": figures,
        }
        if kind == "balance_sheet":
            out["balanced"] = data["balanced"][index]
        return out

    @agent.tool_plain
    def get_account_details(account: str, year: int, month: int | None = None) -> dict[str, Any]:
        """The real balance of one account, for a period.

        Use this when the question is about a single account - cash, payables,
        inventory - rather than a whole statement.

        Args:
            account: exactly as it appears in the chart of accounts, e.g.
                "Cash/Bank", "Account Payable", "Inventory".
            year: the year, e.g. 2026.
            month: 1-12 for a single month, or omit for the year to date.

        Returns:
            For a balance sheet account, the closing balance at the end of the
            period. For a revenue or expense account, the movement during it.
            Also the debit and credit totals behind that figure.
        """
        name = account.strip()
        acct = ACCOUNTS.get(name)
        if acct is None:
            match = next((c for c in ACCOUNTS if c.lower() == name.lower()), None)
            if match is None:
                return {
                    "error": f"No account called {account!r}.",
                    "valid_accounts": list(ACCOUNTS),
                }
            name, acct = match, ACCOUNTS[match]

        if month is not None and not 1 <= month <= 12:
            return {"error": f"month must be 1-12, got {month}"}

        entries = db.list_entries()
        if not _has_entries(entries, year):
            return {"account": name, "period": f"{year}", "figures_available": False,
                    "note": f"No entries have been posted for {year}."}

        index, period = _index_and_label(year, month)
        months = range(12) if month is None else [month - 1]

        debits = credits = 0
        for e in entries:
            if e["cancelled"] or e["date"][:4] != str(year):
                continue
            m = int(e["date"][5:7]) - 1
            if m not in months:
                continue
            for ln in e["lines"]:
                if ln["account"] != name:
                    continue
                if ln["side"] == "Dr":
                    debits += ln["amount"]
                else:
                    credits += ln["amount"]

        movement = debits - credits if acct["normal"] == "Dr" else credits - debits
        is_balance_sheet = acct["type"] in {"Asset", "Liability", "Equity"}

        if is_balance_sheet:
            data = reports.balance_sheet(entries, year)
            closing = _row(data, name, index)
        else:
            closing = None

        return {
            "account": name,
            "type": acct["type"],
            "normal_balance": acct["normal"],
            "period": period,
            "currency": "IDR",
            "figures_available": True,
            "debits_total": debits,
            "credits_total": credits,
            "movement_in_period": movement,
            "closing_balance": closing,
            "reported_as": "closing balance" if is_balance_sheet else "movement in the period",
            "source": "Balance Sheet page" if is_balance_sheet else "P&L page",
        }

    @agent.tool_plain
    def compare_financial_periods(
        year_a: int,
        year_b: int,
        month_a: int | None = None,
        month_b: int | None = None,
    ) -> dict[str, Any]:
        """Compare two periods and show what changed.

        Period A is the earlier one and period B the later, so a positive
        change means B is higher.

        Args:
            year_a: year of the first period.
            year_b: year of the second period.
            month_a: 1-12, or omit for the whole of year A.
            month_b: 1-12, or omit for the whole of year B.

        Returns:
            Each P&L line with both figures, the change, and the percentage
            change. `percent_change` is null where the earlier figure is zero -
            a change from nothing has no percentage, and inventing one would
            be a lie.
        """
        for m in (month_a, month_b):
            if m is not None and not 1 <= m <= 12:
                return {"error": f"month must be 1-12, got {m}"}

        entries = db.list_entries()
        missing = [y for y in {year_a, year_b} if not _has_entries(entries, y)]
        if missing:
            return {
                "comparison_possible": False,
                "note": f"No entries posted for {', '.join(str(y) for y in sorted(missing))}.",
            }

        ia, label_a = _index_and_label(year_a, month_a)
        ib, label_b = _index_and_label(year_b, month_b)
        a = reports.profit_and_loss(entries, year_a)
        b = reports.profit_and_loss(entries, year_b)

        changes = []
        for r in a["rows"]:
            if r["kind"] == "spacer" or not r.get("values"):
                continue
            before = r["values"][ia]
            after = _row(b, r["label"], ib)
            if before == 0 and after == 0:
                continue
            changes.append({
                "label": r["label"],
                "period_a": before,
                "period_b": after,
                "change": after - before,
                "percent_change": None if before == 0 else round((after - before) / abs(before) * 100, 1),
            })

        return {
            "comparison_possible": True,
            "period_a": label_a,
            "period_b": label_b,
            "currency": "IDR",
            "changes": changes,
            "source": "P&L page",
        }

    @agent.tool_plain
    def calculate_financial_ratio(ratio: str, year: int, month: int | None = None) -> dict[str, Any]:
        """Work out a financial ratio from the real figures.

        Returns the inputs alongside the answer, so the number can be checked
        rather than taken on trust. Quote the inputs when you explain it.

        Args:
            ratio: one of "net_profit_margin", "gross_profit_margin",
                "current_ratio", "quick_ratio", "debt_to_equity",
                "return_on_equity". Call with an unknown name to see the list.
            year: the year, e.g. 2026.
            month: 1-12, or omit for the year to date.

        Returns:
            The value, the inputs it came from, and a plain-language reading.
            `value` is null when it cannot be computed - a zero denominator is
            reported as such, never rounded into a number.
        """
        key = ratio.strip().lower().replace(" ", "_").replace("-", "_")
        supported = {
            "net_profit_margin", "gross_profit_margin", "current_ratio",
            "quick_ratio", "debt_to_equity", "return_on_equity",
        }
        aliases = {
            "profit_margin": "net_profit_margin",
            "margin": "net_profit_margin",
            "gross_margin": "gross_profit_margin",
            "liquidity": "current_ratio",
            "acid_test": "quick_ratio",
            "de_ratio": "debt_to_equity",
            "roe": "return_on_equity",
        }
        key = aliases.get(key, key)
        if key not in supported:
            return {"error": f"I don't calculate {ratio!r}.", "supported": sorted(supported)}

        if month is not None and not 1 <= month <= 12:
            return {"error": f"month must be 1-12, got {month}"}

        entries = db.list_entries()
        if not _has_entries(entries, year):
            return {"ratio": key, "value": None,
                    "note": f"No entries have been posted for {year}, so there is nothing to work from."}

        index, period = _index_and_label(year, month)
        pnl = reports.profit_and_loss(entries, year)
        bs = reports.balance_sheet(entries, year)

        revenue = _row(pnl, "Revenue", index)
        gross = _row(pnl, "Gross Profit", index)
        ebit = _row(pnl, "EBIT", index)
        assets = _row(bs, "Total Assets", index)
        liabilities = _row(bs, "Liability", index)
        equity = _row(bs, "Equity", index)
        inventory = _row(bs, "Inventory", index)

        recipes: dict[str, tuple[str, dict[str, int], float | None, str]] = {
            "net_profit_margin": (
                "EBIT ÷ Revenue",
                {"EBIT": ebit, "Revenue": revenue},
                _ratio(ebit, revenue),
                "share of each rupiah of revenue left as profit",
            ),
            "gross_profit_margin": (
                "Gross Profit ÷ Revenue",
                {"Gross Profit": gross, "Revenue": revenue},
                _ratio(gross, revenue),
                "share of revenue left after the direct cost of the work",
            ),
            "current_ratio": (
                "Total Assets ÷ Total Liabilities",
                {"Total Assets": assets, "Total Liabilities": liabilities},
                _ratio(assets, liabilities),
                "how many times over short-term obligations are covered",
            ),
            "quick_ratio": (
                "(Total Assets − Inventory) ÷ Total Liabilities",
                {"Total Assets": assets, "Inventory": inventory, "Total Liabilities": liabilities},
                _ratio(assets - inventory, liabilities),
                "the same cover, ignoring stock that still has to be sold",
            ),
            "debt_to_equity": (
                "Total Liabilities ÷ Equity",
                {"Total Liabilities": liabilities, "Equity": equity},
                _ratio(liabilities, equity),
                "how much is owed for every rupiah the owners hold",
            ),
            "return_on_equity": (
                "EBIT ÷ Equity",
                {"EBIT": ebit, "Equity": equity},
                _ratio(ebit, equity),
                "profit earned for every rupiah of owners' money",
            ),
        }

        formula, inputs, value, meaning = recipes[key]
        out: dict[str, Any] = {
            "ratio": key,
            "period": period,
            "formula": formula,
            "inputs": inputs,
            "currency": "IDR",
            "value": value,
            "means": meaning,
            "source": "P&L and Balance Sheet pages",
        }
        if value is None:
            zero = [k for k, v in inputs.items() if not v]
            out["note"] = (
                f"Cannot be calculated for {period}: {' and '.join(zero)} is zero. "
                f"Say so rather than reporting a number."
            )
        elif key in {"net_profit_margin", "gross_profit_margin"}:
            out["as_percent"] = round(value * 100, 1)

        # every account in this chart is current - there are no long-term items
        if key in {"current_ratio", "quick_ratio"}:
            out["assumption"] = (
                "Berbeda's chart has no long-term assets or liabilities, so total "
                "assets and total liabilities are all current."
            )
        return out

    @agent.tool_plain
    def explain_journal_entry(description: str) -> dict[str, Any]:
        """Find the posting templates that fit a described transaction.

        Use this when someone describes something that happened and wants to
        know how it is booked. It returns the app's own templates, so the
        debits and credits you quote are the ones the app would actually
        write - not a treatment reasoned out from scratch.

        Args:
            description: what happened, in the user's words, e.g.
                "paid a vendor for shipping" or "client sent a deposit".

        Returns:
            The closest templates with their entries. More than one may fit -
            if so, ask which it was rather than picking for them.
        """
        words = {w for w in re.findall(r"[a-z]+", description.lower()) if len(w) > 2}
        if not words:
            return {"matches": [], "note": "Nothing to match on - ask what the transaction was."}

        STOP = {"the", "for", "and", "with", "from", "was", "our", "its", "have", "has",
                "did", "how", "what", "this", "that", "they", "paid", "got"}
        meaningful = words - STOP

        scored: list[tuple[int, dict[str, Any]]] = []
        for t in TEMPLATES.values():
            if t.get("manual"):
                continue
            haystack = " ".join([
                t["label"], t["group"],
                " ".join(ln["account"] for ln in t.get("lines", [])),
                t.get("detail_default", "") or "",
            ]).lower()
            score = sum(1 for w in meaningful if w in haystack)
            # "paid" and "pay" are the commonest words in these questions
            if any(w in description.lower() for w in ("paid", "pay")) and "Pay" in t["label"]:
                score += 1
            if score:
                scored.append((score, t))

        scored.sort(key=lambda x: (-x[0], x[1]["id"]))
        matches = [
            {
                "template_id": t["id"],
                "label": t["label"],
                "group": t["group"],
                "requires_sku": t.get("sku") == "required",
                "settlement_choices": [SETTLEMENT[m]["label"] for m in t.get("settlement", [])],
                "entry": [
                    {
                        "side": ln["side"],
                        "account": "(whichever you pick under 'how settled')"
                                   if ln["account"] == "@settlement" else ln["account"],
                        "amount": ln["amount"],
                        "filled_automatically": bool(ln.get("auto")),
                    }
                    for ln in t.get("lines", [])
                ],
            }
            for _, t in scored[:3]
        ]

        return {
            "described": description,
            "matches": matches,
            "note": (
                "No template clearly matches - ask what was bought or received, and "
                "whether it has been paid."
                if not matches
                else "More than one may fit; if so, ask which before answering."
                if len(matches) > 1
                else "One clear match."
            ),
            "posted_on": "the Journal Entries page",
        }

    return agent
