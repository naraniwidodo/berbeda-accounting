"""Pydantic data models for the API and the agent.

Everything crossing the wire is declared here, so a route reads as a shape
rather than a dictionary of unknowns.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Side = Literal["Dr", "Cr"]
AccountType = Literal["Asset", "Liability", "Equity", "Revenue", "Expense"]


# ── journal ───────────────────────────────────────────────────────────────


class JournalLine(BaseModel):
    side: Side
    account: str
    detail: str | None = None
    amount: int = Field(gt=0)
    auto: bool = False


class JournalEntry(BaseModel):
    id: str
    date: str
    transaction_no: str
    template_id: str
    template_label: str
    sku: str = ""
    settlement: str | None = None
    detail: str | None = None
    note: str | None = None
    invoice_no: str | None = None
    payment_source: str | None = None
    created_at: str
    voided_at: str | None = None
    void_reason: str | None = None
    cancelled: bool = False
    lines: list[JournalLine] = []


class JournalLineIn(BaseModel):
    """A line typed by hand, for `F1 · Others (manual entry)` only."""

    side: Side
    account: str
    detail: str | None = None
    amount: int = Field(gt=0)


class EntryIn(BaseModel):
    template_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    values: dict[str, int] = {}
    settlement: str | None = None
    detail: str | None = None
    sku: str = ""
    note: str | None = None
    #: The supplier's own invoice number, typed by the user.
    invoice_no: str | None = Field(default=None, max_length=64)
    #: Where the purchase was made - Shopee, TikTok, a shop. The source
    #: workbook calls this NAMA VENDOR.
    payment_source: str | None = Field(default=None, max_length=120)
    #: Hand-written debits and credits. **Accepted only when the template is
    #: a manual one** - for every other template the lines come from the
    #: template itself, and sending them here is refused rather than trusted.
    lines: list[JournalLineIn] | None = None


class CancelIn(BaseModel):
    reason: str = Field(min_length=1)


# ── clients ───────────────────────────────────────────────────────────────


class Client(BaseModel):
    sku: str
    client_name: str
    project: str = ""
    dp_date: str | None = None
    note: str | None = None
    created_at: str
    open_prepayment: int = 0
    has_entries: bool = False


class ClientIn(BaseModel):
    """A project to journal against.

    `sku` is the key the journal points at, so it is normalised and cannot be
    changed afterwards - renaming it would orphan every entry already posted.
    """

    sku: str = Field(min_length=2, max_length=24, pattern=r"^[A-Za-z0-9._-]+$")
    client_name: str = Field(min_length=1, max_length=120)
    project: str = Field(default="", max_length=400)
    dp_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=400)


class ClientEdit(BaseModel):
    client_name: str = Field(min_length=1, max_length=120)
    project: str = Field(default="", max_length=400)
    dp_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=400)


# ── period lock ───────────────────────────────────────────────────────────


class PasswordIn(BaseModel):
    password: str = Field(min_length=4)


class LockIn(BaseModel):
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    note: str | None = None


class UnlockIn(BaseModel):
    password: str
    note: str | None = None


# ── chat ──────────────────────────────────────────────────────────────────

Role = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatUsage(BaseModel):
    """What one question cost, and where the session stands.

    `limit` is the per-question ceiling, not a budget - see
    `agent.usage_limits()`. The session total resets when the server does.
    """

    question_tokens: int = 0
    session_tokens: int = 0
    session_calls: int = 0
    cached_tokens: int = 0
    limit_per_question: int | None = None


class ChatReply(BaseModel):
    """What the agent produced, plus how it got there.

    `grounded_in` is the honest part: it lists the tools whose results the
    answer actually rests on. An answer about Berbeda's own numbers with an
    empty `grounded_in` is an answer that invented them, and the route rejects
    it rather than passing it on.
    """

    reply: str
    model: str | None = None
    grounded_in: list[str] = []
    configured: bool = True
    usage: ChatUsage | None = None


class ToolCallRecord(BaseModel):
    name: str
    args: dict[str, Any] = {}
