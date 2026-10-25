"""Pydantic AI agent for the accounting helper.

Model is `gpt-6-luna`, pinned for this project (see AGENTS.md), reached over
Portkey's OpenAI-compatible endpoint.

Two guards live here rather than in the prompt, because a prompt is a request
and these need to be guarantees:

  * **which model answered** is read off the response and checked, since the
    gateway returns HTTP 200 for an unrecognised model name and quietly
    answers with gpt-5.6-luna instead;
  * **which tools ran** is collected from the message history, so the route
    can tell an answer grounded in a tool result from one the model produced
    out of nowhere.
"""

from __future__ import annotations

import os
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI, AuthenticationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelResponse, ModelRequest, ToolCallPart, ToolReturnPart
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

import tools
from models import ChatMessage, ChatReply

BACKEND = Path(__file__).resolve().parent
PROMPT_PATH = BACKEND / "prompts" / "prompt.md"

#: Pinned. Never substitute another model - see AGENTS.md.
MODEL = "gpt-6-luna"

#: Token usage per question goes here. Silence it with
#: `logging.getLogger("berbeda.chat").setLevel(logging.WARNING)`.
log = logging.getLogger("berbeda.chat")

#: Running totals for **this server process**.
#:
#: In memory, so they reset whenever the process restarts - and with
#: `--reload` that is every time a backend file is saved. Read them as "since
#: the server last started", not as an all-time bill. `GET /api/usage` returns
#: the same figures without reading the log.
TOTALS = {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0, "calls": 0}


def _env_int(name: str, default: int | None) -> int | None:
    """An integer from the environment; empty or "none" switches the cap off."""
    raw = (os.getenv(name) or "").strip().lower()
    if raw in {"", "none", "off"}:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


#: Ceilings for **one question**, not for the day.
#:
#: pydantic-ai applies these to a single agent run, so they stop a runaway
#: loop - a model calling tools over and over, or an answer that will not
#: end - before it spends real money. They are not a budget: the session
#: total in TOTALS, and whatever limit the Portkey account carries, are
#: separate things.
#:
#: Sized generously against observed traffic. The biggest real question so far
#: used about 10k tokens and 2 tool calls, so these leave several times that
#: headroom and should never fire during normal use. If one does, something
#: has gone wrong rather than something being popular.
#:
#: Override any of them in .env: CHAT_TOTAL_TOKENS_LIMIT, CHAT_OUTPUT_TOKENS_LIMIT,
#: CHAT_REQUEST_LIMIT, CHAT_TOOL_CALLS_LIMIT. Set a value to "none" to lift it.
def usage_limits() -> UsageLimits:
    return UsageLimits(
        total_tokens_limit=_env_int("CHAT_TOTAL_TOKENS_LIMIT", 60_000),
        output_tokens_limit=_env_int("CHAT_OUTPUT_TOKENS_LIMIT", 2_000),
        request_limit=_env_int("CHAT_REQUEST_LIMIT", 8),
        tool_calls_limit=_env_int("CHAT_TOOL_CALLS_LIMIT", 10),
    )


class LimitReached(RuntimeError):
    """One question hit a usage ceiling. Said plainly rather than as a 502."""

# A clone of this repository has no .env one level above it, so look in the
# project root first and fall back to the author's own location.
PROJECT_ROOT = BACKEND.parent
for _env in (PROJECT_ROOT / ".env", PROJECT_ROOT.parent / ".env"):
    if _env.exists():
        load_dotenv(_env)
        break


class ModelMismatch(RuntimeError):
    """The gateway answered with a model other than the pinned one."""


class NotConfigured(RuntimeError):
    """No Portkey API key available."""


class KeyRejected(RuntimeError):
    """The gateway refused the key. Almost always a wrong or expired key."""


#: Values that mean "nobody has filled this in yet".
#:
#: `.env.example` ships a placeholder, and a fresh clone is copied from it. If
#: the placeholder counted as a key the app would report itself configured,
#: offer the chatbot, and then come back with a raw 401 from the gateway. It is
#: far kinder to notice that nothing was filled in and say so.
_UNSET = {"", "your-portkey-api-key-here", "your-api-key-here", "changeme",
          "replace-me", "todo", "none"}


def _api_key() -> str | None:
    raw = (os.getenv("PORTKEY_API_KEY") or "").strip()
    return None if raw.lower() in _UNSET else raw


def portkey_config() -> dict[str, str | None]:
    return {
        "api_key": _api_key(),
        "base_url": os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1"),
        "provider": os.getenv("PORTKEY_PROVIDER", "openai"),
    }


def is_configured() -> bool:
    return bool(portkey_config()["api_key"])


def system_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def verify_model_id(returned: str | None) -> str:
    """Check which model actually answered, and refuse anything else.

    The gateway does not reject an unknown model name - it returns 200 and
    answers with gpt-5.6-luna. Setting the request string is therefore not
    evidence that the right model replied.
    """
    name = (returned or "").split("/")[-1]
    if not name.startswith(MODEL):
        raise ModelMismatch(
            f"expected {MODEL!r}, gateway answered with {returned!r}. "
            f"Refusing the response rather than silently using another model."
        )
    return name


@lru_cache(maxsize=1)
def build_agent() -> Agent:
    cfg = portkey_config()
    if not cfg["api_key"]:
        raise NotConfigured("PORTKEY_API_KEY is not set")

    client = AsyncOpenAI(
        api_key=cfg["api_key"],
        base_url=cfg["base_url"],
        default_headers={"x-portkey-provider": cfg["provider"] or "openai"},
    )
    model = OpenAIChatModel(MODEL, provider=OpenAIProvider(openai_client=client))

    # gpt-6-luna rejects function tools on /chat/completions unless reasoning
    # is off: "Function tools with reasoning_effort are not supported ...
    # set reasoning_effort to 'none'". The helper looks accounts up rather
    # than reasoning them out, so there is nothing to lose here.
    settings = OpenAIChatModelSettings(
        openai_reasoning_effort="none",
        temperature=0.2,
        max_tokens=400,
    )

    agent = Agent(
        model,
        output_type=str,
        instructions=system_prompt(),
        model_settings=settings,
        retries=2,
        name="berbeda-accounting-helper",
    )
    return tools.register(agent)


@dataclass
class Run:
    reply: str
    model: str
    tools_used: list[str]
    #: Raw content the tools returned, against which figures are checked.
    evidence: str
    #: What this one question cost.
    question_tokens: int = 0
    cached_tokens: int = 0


async def ask(messages: list[ChatMessage]) -> Run:
    """Run one turn. Raises rather than returning a half-trusted answer."""
    agent = build_agent()

    history = messages[:-1]
    question = messages[-1].content
    preamble = "\n".join(f"{m.role}: {m.content}" for m in history)
    prompt = f"{preamble}\nuser: {question}" if preamble else question

    try:
        result = await agent.run(prompt, usage_limits=usage_limits())
    except AuthenticationError as exc:
        # a wrong key is the commonest setup mistake; name it rather than
        # passing the gateway's own wording back to the user
        log.warning("gateway rejected the API key")
        raise KeyRejected(
            "Portkey rejected the API key. Check PORTKEY_API_KEY in the .env "
            "file at the project root, then restart the server."
        ) from exc
    except UsageLimitExceeded as exc:
        # a ceiling fired: report it as itself, not as "the helper could not
        # answer", so the cause is visible rather than guessed at
        log.warning("usage limit reached: %s", exc)
        raise LimitReached(str(exc)) from exc

    # `usage` is a property on AgentRunResult, not a method
    usage = result.usage
    TOTALS["input_tokens"] += usage.input_tokens
    TOTALS["output_tokens"] += usage.output_tokens
    TOTALS["cached_tokens"] += usage.cache_read_tokens
    TOTALS["calls"] += 1

    # one line, so a call's numbers and the running totals stay together even
    # when requests overlap
    log.info(
        "tokens in=%s out=%s cached=%s tools=%s | session in=%s out=%s total=%s over %s calls",
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_read_tokens,
        usage.tool_calls,
        TOTALS["input_tokens"],
        TOTALS["output_tokens"],
        TOTALS["input_tokens"] + TOTALS["output_tokens"],
        TOTALS["calls"],
    )

    model_name: str | None = None
    used: list[str] = []
    returned: list[str] = []
    for message in result.all_messages():
        if isinstance(message, ModelResponse):
            model_name = message.model_name or model_name
            for part in message.parts:
                if isinstance(part, ToolCallPart):
                    used.append(part.tool_name)
        elif isinstance(message, ModelRequest):
            for part in message.parts:
                if isinstance(part, ToolReturnPart):
                    returned.append(str(part.content))

    verified = verify_model_id(model_name)
    return Run(
        reply=(result.response.text or "").strip(),
        model=verified,
        tools_used=used,
        evidence=" ".join(returned),
        question_tokens=usage.input_tokens + usage.output_tokens,
        cached_tokens=usage.cache_read_tokens,
    )


# ── grounding ─────────────────────────────────────────────────────────────

#: Tools that return real figures from the journal. **Add the name of any new
#: data tool here**, or the guard below will treat its figures as invented.
FINANCIAL_TOOLS: set[str] = {
    "get_financial_report",
    "get_account_details",
    "compare_financial_periods",
    "calculate_financial_ratio",
}

#: Money-shaped: "Rp 300.000", "1,200,000". Deliberately does not match a bare
#: year or "Art 21", which are not figures.
_MONEY = re.compile(r"(?:Rp\s*[\d][\d.,]*)|(?:\d{1,3}(?:[.,]\d{3})+)")


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def check_grounding(
    reply: str,
    tools_used: list[str],
    asked: str = "",
    evidence: str = "",
) -> str | None:
    """Refuse any figure the model was not actually given.

    The prompt tells the helper never to invent numbers, but a prompt is a
    request; this is the check. Every money-shaped figure in the reply has to
    trace back to one of two places:

      * **a tool result in this conversation** - `evidence` is the raw content
        the tools returned, so a figure is only allowed if that exact number
        was handed to the model;
      * **the user's own question** - quoting "you paid 200,000" back while
        explaining how to book it is not an invention, and refusing it would
        make the helper useless for the commonest question it gets.

    Checking against the returned content, rather than merely noting that a
    financial tool ran, is what stops a real total appearing beside a
    plausible invented one. Calling the tool is not a licence to say any
    number.

    Returns a replacement reply, or None when the answer is fine.
    """
    figures = _MONEY.findall(reply)
    if not figures:
        return None

    allowed = _digits(asked) + "|" + _digits(evidence)
    unexplained = [f for f in figures if _digits(f) and _digits(f) not in allowed]
    if not unexplained:
        return None

    if FINANCIAL_TOOLS & set(tools_used):
        return (
            "I had the real figures in front of me but one of the numbers in my answer "
            "didn't match them, so I'd rather not show it. Have a look at the P&L or "
            "Balance Sheet page for the period you're after."
        )
    return (
        "I nearly answered with a figure I can't actually see — so I've stopped myself. "
        "I can explain how an account or an entry works, but for real numbers check the "
        "Journal Entries, P&L or Balance Sheet page."
    )


def not_configured_reply() -> ChatReply:
    return ChatReply(
        reply=(
            "The accounting helper isn't connected yet — no API key is set. "
            "Once it is, ask me things like why a settlement debits Prepayment Client."
        ),
        model=None,
        grounded_in=[],
        configured=False,
    )
