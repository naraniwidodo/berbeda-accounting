"""Berbeda accounting API.

Connects the website to the accounting machine: posting templates in, balanced
journal entries stored, P&L and Balance Sheet out. Plus an accounting helper
that explains technique and reads real figures - but only ever through a tool,
and only figures a tool actually returned.

Run, from this directory, with the venv activated:
    uvicorn main:app --reload --port 8000

The rules that matter are enforced here, not in the browser, so they hold for
any caller:

  * an entry is rendered by the same template engine the front end previews
    with, and must balance before it is stored;
  * transaction numbers are assigned by the database, in sequence, counting
    cancelled entries so none is ever reused;
  * nothing is deleted - cancelling sets a flag and keeps the row;
  * a closed period refuses both posting and cancellation.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import agent as helper
import db
import lock
import reports
from engine import CHART, TEMPLATES, PostingError, render, validate
from models import (
    CancelIn,
    ChatUsage,
    ClientEdit,
    ClientIn,
    ChatReply,
    ChatRequest,
    EntryIn,
    LockIn,
    PasswordIn,
    UnlockIn,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    # A logger of our own is silent by default under uvicorn: the root logger
    # sits at WARNING and uvicorn configures only its own. Borrowing uvicorn's
    # handler puts the token line in the same stream and format as every other
    # line in the log.
    #
    # The handler is not always on "uvicorn.error" - uvicorn's default config
    # leaves that one empty and puts the handler on the parent - so walk up
    # until one is found, and fall back to stderr if uvicorn is not running
    # (under `python -c`, say).
    handlers: list[logging.Handler] = []
    for name in ("uvicorn.error", "uvicorn", "uvicorn.access"):
        handlers = logging.getLogger(name).handlers
        if handlers:
            break
    helper.log.handlers = handlers or [logging.StreamHandler()]
    helper.log.setLevel(logging.INFO)
    helper.log.propagate = False
    yield


CHAT_FLOW = """
A question travels like this:

1. **Business owner** types a question in the chat panel — on any page, not
   just Journal Entries. It answers questions; it cannot post, cancel or lock.
2. **Frontend** sends the whole conversation to `POST /api/chat`, so
   follow-ups keep their context.
3. **FastAPI** validates it against `ChatRequest` and hands it to the agent.
4. **AI agent** (Pydantic AI on `gpt-6-luna`, system prompt in
   `prompts/prompt.md`) decides whether any tool is needed. *Not every
   question needs one* — general accounting is answered directly.
5. **Tool selection** — eight tools in `tools.py`: four explain method, four
   return real figures.
6. **Data and calculation** — tools read the SQLite journal through `db.py`
   and compute in Python through `reports.py`. Excel is the **export**, not
   the source.
7. **Agent responds**, quoting the inputs behind any figure. Two guards run
   before anything is returned:
   - `verify_model_id()` — the model that answered must be `gpt-6-luna`,
     else `502`. The gateway downgrades silently, so this is checked rather
     than trusted.
   - `check_grounding()` — every money figure must trace to a tool result or
     to the user's own question, or it is replaced.
8. **FastAPI returns** `ChatReply { reply, model, grounded_in, configured }`.
9. **Frontend displays** the answer, with `grounded_in` shown underneath so
   the user can see which tools step 5 actually chose.
"""

app = FastAPI(
    title="Berbeda accounting API",
    version="1.0.0",
    description=CHAT_FLOW,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── meta ──────────────────────────────────────────────────────────────────


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"ok": True, "model": helper.MODEL, "aiConfigured": helper.is_configured()}


@app.get("/api/usage")
def usage() -> dict[str, object]:
    """Token totals since this server process started.

    In memory, so a restart resets them - and under `--reload` that is every
    time a backend file is saved. A session figure, not a bill.
    """
    t = helper.TOTALS
    limits = helper.usage_limits()
    return {
        **t,
        "total_tokens": t["input_tokens"] + t["output_tokens"],
        "model": helper.MODEL,
        # per question, not per day - see agent.usage_limits()
        "limits_per_question": {
            "total_tokens": limits.total_tokens_limit,
            "output_tokens": limits.output_tokens_limit,
            "requests": limits.request_limit,
            "tool_calls": limits.tool_calls_limit,
        },
        "note": "totals are since this server process started; limits apply per question",
    }


@app.get("/api/meta")
def meta() -> dict[str, object]:
    """Chart of accounts, settlement modes and templates.

    Served so the browser can stop carrying its own copy; the project root
    files stay the single source of truth.
    """
    return {
        "accounts": CHART["accounts"],
        "settlement": CHART["settlement"],
        "templates": list(TEMPLATES.values()),
    }


# ── clients ───────────────────────────────────────────────────────────────


@app.get("/api/clients")
def get_clients() -> dict[str, object]:
    return {"clients": db.list_clients()}


@app.post("/api/clients", status_code=201)
def post_client(body: ClientIn) -> dict[str, object]:
    sku = body.sku.strip().upper()
    if db.get_client(sku):
        raise HTTPException(409, f"{sku} is already registered")
    return {
        "client": db.insert_client(
            sku=sku,
            client_name=body.client_name.strip(),
            project=body.project.strip(),
            dp_date=body.dp_date,
            note=(body.note or "").strip() or None,
        )
    }


@app.put("/api/clients/{sku}")
def put_client(sku: str, body: ClientEdit) -> dict[str, object]:
    if not db.get_client(sku):
        raise HTTPException(404, f"{sku} is not registered")
    return {
        "client": db.update_client(
            sku,
            client_name=body.client_name.strip(),
            project=body.project.strip(),
            dp_date=body.dp_date,
            note=(body.note or "").strip() or None,
        )
    }


@app.delete("/api/clients/{sku}")
def remove_client(sku: str) -> dict[str, object]:
    if not db.get_client(sku):
        raise HTTPException(404, f"{sku} is not registered")
    if not db.delete_client(sku):
        raise HTTPException(
            409,
            f"{sku} has journal entries posted against it. Removing it would leave "
            f"those entries pointing at a project that no longer exists.",
        )
    return {"removed": sku}


# ── journal ───────────────────────────────────────────────────────────────


@app.get("/api/entries")
def get_entries() -> dict[str, object]:
    entries = db.list_entries()
    return {
        "entries": entries,
        "openPrepayment": db.open_prepayment(),
        "nextNumbers": {
            p: db.peek_next_transaction_no(t)
            for t, p in (("A1", "SPM"), ("B1", "NSPB"), ("D1", "ART"), ("E1", "NSPM"))
        },
    }


@app.get("/api/entries/next-number")
def next_number(template_id: str) -> dict[str, str]:
    return {"transactionNo": db.peek_next_transaction_no(template_id)}


@app.post("/api/entries", status_code=201)
def post_entry(body: EntryIn) -> dict[str, object]:
    template = TEMPLATES.get(body.template_id)
    if template is None:
        raise HTTPException(404, f"unknown template {body.template_id}")

    try:
        lock.guard(body.date, "posted")
    except lock.LockError as exc:
        raise HTTPException(409, str(exc)) from exc

    sku = body.sku.strip().upper()
    if template.get("sku") == "required":
        if not sku:
            raise HTTPException(422, f"{template['id']} needs a project")
        if not db.get_client(sku):
            raise HTTPException(
                422,
                f"{sku} is not registered. Add it on the Client Registration page first — "
                f"that is what ties a settlement back to the right deposit.",
            )

    warnings: list[str] = []

    if template.get("manual"):
        # the one template with no posting rule of its own: the user supplies
        # the lines, and they face exactly the same validator as a rendered
        # entry - balanced, real accounts, details valid for those accounts
        if not body.lines:
            raise HTTPException(422, f"{template['id']} needs at least two lines")
        lines = [
            {
                "side": ln.side,
                "account": ln.account,
                "detail": ln.detail,
                "amount": ln.amount,
                "auto": False,
            }
            for ln in body.lines
        ]
        try:
            validate(lines)
        except PostingError as exc:
            raise HTTPException(422, str(exc)) from exc
        warnings.append("Manual entry - flagged for review")
    else:
        # lines are the template's to decide. Accepting them here would let a
        # caller post any debits and credits under a template's name, which is
        # the guarantee this endpoint exists to make.
        if body.lines:
            raise HTTPException(
                422,
                f"{template['id']} writes its own lines. Only a manual template "
                f"accepts them from the request.",
            )
        values = dict(body.values)
        # the clearing line is read from the ledger, never from the request, so
        # it cannot be understated or left out
        if any(c["name"] == "dp_open" for c in template.get("context", [])):
            values["dp_open"] = db.open_prepayment().get(sku, 0)

        try:
            lines, warnings = render(
                body.template_id, values, settlement=body.settlement, detail=body.detail
            )
        except PostingError as exc:
            raise HTTPException(422, str(exc)) from exc

    entry = db.insert_entry(
        date=body.date,
        template_id=template["id"],
        template_label=f"{template['id']} · {template['label']}",
        lines=lines,
        sku=sku,
        settlement=body.settlement,
        detail=body.detail,
        note=body.note,
        invoice_no=(body.invoice_no or "").strip() or None,
        payment_source=(body.payment_source or "").strip() or None,
    )
    return {"entry": entry, "warnings": warnings}


@app.post("/api/entries/{entry_id}/cancel")
def cancel(entry_id: str, body: CancelIn) -> dict[str, object]:
    entry = db.get_entry(entry_id)
    if entry is None:
        raise HTTPException(404, "no such entry")
    if entry["cancelled"]:
        raise HTTPException(409, "already cancelled")

    try:
        lock.guard(entry["date"], "cancelled")
    except lock.LockError as exc:
        raise HTTPException(409, str(exc)) from exc

    return {"entry": db.cancel_entry(entry_id, body.reason)}


# ── statements ────────────────────────────────────────────────────────────


@app.get("/api/reports/years")
def report_years() -> dict[str, list[int]]:
    return {"years": reports.years_in(db.list_entries())}


@app.get("/api/reports/pnl")
def pnl(year: int) -> dict[str, object]:
    return reports.profit_and_loss(db.list_entries(), year)


@app.get("/api/reports/balance-sheet")
def bs(year: int) -> dict[str, object]:
    return reports.balance_sheet(db.list_entries(), year)


# ── period lock ───────────────────────────────────────────────────────────


@app.get("/api/lock")
def lock_status() -> dict[str, object]:
    return lock.state()


@app.post("/api/lock/password")
def lock_password(body: PasswordIn) -> dict[str, object]:
    if lock.state()["hasPassword"]:
        raise HTTPException(409, "a password is already set")
    lock.set_password(body.password)
    return lock.state()


@app.post("/api/lock")
def lock_period(body: LockIn) -> dict[str, object]:
    if not lock.state()["hasPassword"]:
        raise HTTPException(409, "set an unlock password first")
    return lock.lock_through(body.period, body.note)


@app.post("/api/lock/unlock")
def lock_unlock(body: UnlockIn) -> dict[str, object]:
    if not lock.verify(body.password):
        raise HTTPException(401, "that password does not match")
    return lock.unlock(body.note)


# ── accounting helper ─────────────────────────────────────────────────────


@app.post("/api/chat", response_model=ChatReply)
async def chat(body: ChatRequest) -> ChatReply:
    """Answer an accounting question. Steps 3 and 8 of the flow above.

    Note what is *not* passed in: no entries, no figures, no counterparties.
    The agent reaches data only through tools, and today it has none that
    return figures - so anything it says about Berbeda's numbers would be
    invented, and `check_grounding` refuses it on the way out.
    """
    if not helper.is_configured():
        return helper.not_configured_reply()

    try:
        run = await helper.ask(body.messages)
    except helper.LimitReached as exc:
        raise HTTPException(
            429,
            f"That question hit a usage ceiling and was stopped: {exc}. "
            f"Try asking something narrower, or raise the limit in .env.",
        ) from exc
    except helper.KeyRejected as exc:
        raise HTTPException(401, str(exc)) from exc
    except helper.ModelMismatch as exc:
        # a quiet downgrade is worse than an outage: say so
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as 502
        raise HTTPException(502, f"the helper could not answer: {exc}") from exc

    asked = " ".join(m.content for m in body.messages if m.role == "user")
    reply = helper.check_grounding(run.reply, run.tools_used, asked, run.evidence) or run.reply
    totals = helper.TOTALS
    return ChatReply(
        reply=reply,
        model=run.model,
        grounded_in=run.tools_used,
        configured=True,
        usage=ChatUsage(
            question_tokens=run.question_tokens,
            cached_tokens=run.cached_tokens,
            session_tokens=totals["input_tokens"] + totals["output_tokens"],
            session_calls=totals["calls"],
            limit_per_question=helper.usage_limits().total_tokens_limit,
        ),
    )
