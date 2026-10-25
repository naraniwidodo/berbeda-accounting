# Berbeda accounting API

FastAPI. Connects the website to the accounting machine, and hosts the
accounting helper.

```bash
cd backend
source .venv/bin/activate          # first time: python3 -m venv .venv
pip install -r requirements.txt    # first time only
uvicorn main:app --reload --port 8000
```

Run it **from `backend/`** — `main:app` is resolved against the working
directory. Activating the venv is what puts `uvicorn` on the path; without it
you would be running whatever `uvicorn` the system has, or none at all.

> ⚠️ **`--reload` only watches `backend/`.** `accounts.json` and
> `templates.json` live at the project root, so editing a template does *not*
> reload the server — it keeps serving the old catalog, and the symptom is
> confusing: entries post under stale labels and retired templates still work.
>
> **Restart the server after any change to those two files.** Re-copy them to
> the front end in the same breath:
>
> ```bash
> cp accounts.json templates.json web/src/data/
> ```

Interactive docs at <http://127.0.0.1:8000/docs>.

| File | Role |
|---|---|
| `main.py` | the app and every route |
| `engine.py` | posting rules; reads `../accounts.json` and `../templates.json` |
| `db.py` | SQLite — append-only journal, transaction numbering |
| `reports.py` | P&L and Balance Sheet |
| `lock.py` | period lock, PBKDF2 password, audit log |
| `agent.py` | Pydantic AI agent — model, guards, one-turn run |
| `tools.py` | tools the agent may call |
| `prompts/prompt.md` | the system prompt |
| `models.py` | Pydantic models for everything crossing the wire |

## Endpoints

| | |
|---|---|
| `GET /api/health` | liveness, pinned model, whether AI is configured |
| `GET /api/usage` | token totals since the server started |
| `GET /api/meta` | chart of accounts, settlement modes, templates |
| `GET /api/entries` | the journal, open down payments, next numbers |
| `GET /api/entries/next-number?template_id=` | next number for that register |
| `POST /api/entries` | render a template, validate, store |
| `POST /api/entries/{id}/cancel` | cancel; the row and its number stay |
| `GET /api/reports/years` | years present in the journal |
| `GET /api/reports/pnl?year=` | P&L, monthly + YTD |
| `GET /api/reports/balance-sheet?year=` | Balance Sheet, monthly |
| `GET /api/lock` | lock state and the audit log |
| `POST /api/lock/password` | set the unlock password (once) |
| `POST /api/lock` | close the books through a month |
| `POST /api/lock/unlock` | reopen; needs the password |
| `POST /api/chat` | accounting helper |

## What the server guarantees

These hold for **any** caller, not only the page that greys out a button:

- an entry is rendered by the template engine and must balance before storage;
- transaction numbers are assigned inside the insert, counting cancelled
  entries, so one can never be issued twice;
- nothing is deleted — there is no `DELETE` in the backend. Cancelling sets
  `voided_at` and keeps the row and its number;
- a closed period refuses **both** posting and cancellation;
- `A4`'s clearing line is read from the ledger, never from the request, so it
  cannot be understated or left out.

## Two copies of the posting rules

The front end runs `web/src/lib/engine.ts`; the API runs `backend/engine.py`.
Only the ~100 lines of evaluation are duplicated — **both read the same
`accounts.json` and `templates.json` at the project root**, so adding or
changing a template is still a one-place edit.

`GET /api/meta` serves those files, so the browser can stop shipping its own
copy under `web/src/data/`. Until it does, re-sync after any change:

```bash
cp accounts.json templates.json web/src/data/
```

## The accounting helper

Pydantic AI agent on `gpt-6-luna`, reached over Portkey. It explains
accounting technique for people without accounting training: two or three
casual sentences, the reasoning rather than just the entry, and a clarifying
question when a transaction is missing something.

### Three guarantees, none of them a prompt instruction

A prompt is a request. These are checks:

1. **It only sees what a tool returned.** `get_financial_report` reads the
   P&L and Balance Sheet through the same report code the pages use, so the
   helper and the pages cannot disagree. Nothing else is reachable — no entry
   list, no counterparty, no customer balance.
2. **Every figure is checked against what the tools returned.**
   `check_grounding()` finds money-shaped numbers in the reply and allows one
   only if that exact number appears in a tool result, or in the user's own
   question. Anything else is replaced before it reaches the browser.

   Checking the *content*, not merely that a financial tool ran, is the point:
   it stops a real total appearing beside a plausible invented one. Calling
   the tool is not a licence to say any number.
3. **The right model answered.** The gateway returns HTTP 200 for an unknown
   model name and quietly answers with `gpt-5.6-luna`, so `verify_model_id()`
   reads the model off the response and raises on a mismatch. A `502` is
   better than a silent downgrade.

It also cannot write: there is no posting, cancelling or locking tool. Those
stay on the pages where a person clicks them.

### Tools

| Tool | Returns |
|---|---|
| `chart_of_accounts` | the seventeen accounts, type and normal balance |
| `posting_templates` | every template and the entry it writes |
| `explain_template` | one template in full |
| `get_financial_report` | **real figures** — P&L or Balance Sheet, by period |

`get_financial_report(statement, year, month=None)` returns labelled figures
in rupiah. An empty `figures` list means no entries for that period, and the
prompt tells the helper to say so rather than report zeros as a result.

**Adding another.** Put it in `tools.py`. If it returns real figures, add its
name to `FINANCIAL_TOOLS` in `agent.py` — the grounding check reads that set.

**Never give the agent a tool that writes.** Posting, cancelling and locking
stay on the pages where a person clicks them.

### Usage limits

`UsageLimits` caps **one question**, not a day's spend:

| | Default | Override in `.env` |
|---|---|---|
| total tokens | 60,000 | `CHAT_TOTAL_TOKENS_LIMIT` |
| output tokens | 2,000 | `CHAT_OUTPUT_TOKENS_LIMIT` |
| model requests | 8 | `CHAT_REQUEST_LIMIT` |
| tool calls | 10 | `CHAT_TOOL_CALLS_LIMIT` |

Set any to `none` to lift it.

These are a runaway guard, not a budget. A real question uses around 10,000
tokens and 1–2 tool calls, so the ceilings sit several times above normal
traffic — if one fires, something has gone wrong rather than something being
popular. The route returns **429** with the reason rather than a generic
failure.

Three different things, easily confused:

- **`UsageLimits`** — per question, enforced here, stops a loop.
- **`TOTALS` / `GET /api/usage`** — running total since the process started,
  across questions. In memory, so a restart resets it.
- **The Portkey account limit** — outside this app entirely, and not visible
  to it.

### Model settings

`reasoning_effort="none"`. `gpt-6-luna` rejects function tools on
`/chat/completions` with reasoning on — *"Function tools with reasoning_effort
are not supported ... set reasoning_effort to 'none'"*. The helper looks
accounts up rather than reasoning them out, so there is nothing lost.
