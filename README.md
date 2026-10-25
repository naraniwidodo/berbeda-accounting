# Berbeda Accounting

Automated journal entries, P&L and Balance Sheet for **Ber.be.da**, a custom
painting business in Indonesia, with an AI accounting assistant.

Built by Nur Maharani (Rani) for AI Foundations, Cohort Silver.

---

## For the teaching team

**This project runs locally from this clone.** Nothing is hosted, so there is no
link that can go to sleep before grading. The steps below are the whole process
and take about five minutes. They were last run end to end on a clean clone on
**25 October 2026**.

**You do not need an API key to mark this.** Without one, every page still works
and the chat panel says plainly that it is not connected. A key only turns on
the chatbot, which is Section 4 of the report.

**Nine test scenarios are written out below**, under
[Testing it yourself, step by step](#testing-it-yourself-step-by-step). They are
the author's own tests, in order, with the exact values to type. Following them
takes about ten minutes and covers registration, a sale in two stages, a
purchase, a manual entry, both statements and the chatbot.

If you would rather read than run, the two deliverables open straight in a
browser with no setup at all:

| Open this | What it is |
|---|---|
| [`output/report.html`](output/report.html) | The report. 15 printed pages, every screenshot embedded |
| [`output/report.pdf`](output/report.pdf) | The same report already printed, if you want the page count |
| [`output/slides.html`](output/slides.html) | The slide deck, 10 slides |

---

## Running it

You need **Python 3.12 or newer** and **Node 20 or newer**. Check with
`python3 --version` and `node --version`.

### 1. Get the code

```bash
git clone https://github.com/naraniwidodo/berbeda-accounting.git
cd berbeda-accounting
cp .env.example .env
```

`.env` ships with an empty key, which is fine. If you do have a Portkey key,
open `.env` and put it after `PORTKEY_API_KEY=`.

### 2. Start the API, in the first terminal

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Run it **from `backend/`**. `main:app` is resolved against the folder you are
standing in, so it fails from anywhere else.

You should see `Uvicorn running on http://127.0.0.1:8000`. Check it:

```bash
curl http://127.0.0.1:8000/api/health
```

```json
{"ok":true,"model":"gpt-6-luna","aiConfigured":false}
```

`aiConfigured` is `false` when no key is set. That is expected, and nothing
else is affected.

### 3. Start the website, in a second terminal

Leave the first terminal running and open a new one, back at the project root.

```bash
cd web
npm install
npm run dev
```

Open **<http://localhost:5173>**.

### 4. Put some data in it

The database is created empty on first run, so the P&L and the Balance Sheet
have nothing to show until something is posted. This fills a year with
**invented** demo transactions, through the real posting rules:

```bash
cd backend
python3 seed_demo.py
```

```
  4 demo clients registered
  22 journal entries posted
```

Now the Balance Sheet reads **Total assets 9,510,000**, **Liabilities + equity
9,510,000**, **Difference 0**.

> The demo clients, SKUs and amounts are all made up. Ber.be.da's real figures
> are confidential and are not in this repository. The screenshots in the
> report are real, published with the owner's consent.

---

## Testing it yourself, step by step

These are the author's own test scenarios. Following them in order takes about
ten minutes and exercises every part of the system.

You can run them on an empty journal or on the seeded one. **If you want to see
only your own entries in the P&L, skip the seed step above.** If you want a
realistic book to add to, seed it first.

Every page is reachable from the navigation bar at the top, so "go back to
Home" is never necessary.

### Test 1. Client Registration

A project has to exist before you can journal against it.

1. Open **Clients** in the navigation.
2. **SKU**: `SKU0326`
3. **Client name**: `Matteo`
4. **Down payment date**: `01/01/2026`
5. **Project**: `Hello Kitty Shoes`
6. Click **Register project**.

The project appears in the table underneath.

### Test 2. Down payment

Do Test 1 first. `A1` needs a registered SKU.

1. Open **Journal Entries**.
2. **What happened**: `A1 - Sales - Down Payment`
3. **Date of transaction**: `01/01/2026`
4. **SKU / project**: pick `SKU0326`, the project from Test 1.
5. **Detail**: `Jasa Lukis`, which is Bahasa Indonesia for painting services.
6. **Down payment received**: `1,403,840`
7. **Total project value**: `2,127,840`
8. Click **Post entry**.

The journal entry appears straight away. An **Undo** button sits beside it for
six seconds, in case the amount was wrong. Undo *cancels* the entry rather than
erasing it: the row stays with its reason recorded and its transaction number
spent, because nothing in this app deletes.

### Test 3. Down payment, final settlement

This continues Test 2, so do that one first.

1. Open **Journal Entries**.
2. **What happened**: `A4 - Sales - Down Payment Final Settlement`
3. **Date of transaction**, **SKU / project** and **Detail**: the same as Test
   2. The SKU is what lets the settlement find the deposit it belongs to.
4. **Cash received**: `724,000`
5. Click **Post entry**.

`1,403,840 + 724,000 = 2,127,840`, so the project is now paid in full and the
down payment is cleared.

> If you skip Test 2 and try this one on its own, the form warns you before you
> can post: *"No open down payment found for SKU0326. Post A1 first, or use A5
> if the sale was paid in full with no DP."* That warning is the feature
> working, not a failure.

### Test 4. Purchase

1. Open **Journal Entries**.
2. **What happened**: pick a purchase. The example uses
   `B1 - Shipping / delivery`, to record the cost of shipping Matteo's shoes.
3. **Detail**: `Pengiriman`, Bahasa Indonesia for shipping.
4. **How settled**: `Paid now`, because shipping is always paid in cash here.
   The other two options are `On credit` and `From prepayment`.
5. **Amount**: whatever the shipping cost was.
6. **Invoice number**: the number on the shipping vendor's invoice.
7. Click **Post entry**.

### Test 5. Sections C and D

These work the same way as Test 4. Pick the template, fill in the fields, post.
Section 4 of [`output/report.html`](output/report.html) documents the author's
own test of each one, with screenshots.

### Test 6. Manual entry

For transactions no template covers. This one needs some journalling
knowledge, because you write the debits and credits yourself.

1. Open **Journal Entries**.
2. **What happened**: `F1 - Others (manual entry)`
3. Fill in the **Manual lines** with both sides. The example records a
   reimbursement to an employee in marketing, which is a made up scenario:

   | Side | Account | Detail | Amount |
   |---|---|---|---|
   | Dr | Marketing | Marketing Others | 10,000 |
   | Cr | Account Payable | Operasional | 10,000 |
   | Dr | Account Payable | Operasional | 10,000 |
   | Cr | Cash/Bank | not needed | 10,000 |

4. Click **Post entry**.

Each line has its own **Detail** dropdown, which fills itself in as soon as you
pick the account, so you can leave it alone unless you want a different one.
Accounts that do not use details, such as `Cash/Bank`, do not show the field.

Manual entries need at least two lines and the debits must equal the credits.
The app refuses anything that does not balance, which is the point of entering
them here rather than in a spreadsheet.

### Test 7. Profit and Loss

1. Open **P&L** in the navigation.
2. Every entry posted above is reflected here. Filter by month, or download as
   Excel or CSV.

### Test 8. Balance Sheet

1. Open **Balance Sheet** in the navigation.
2. The same entries, as closing balances. **Difference** should read `0`.
   Download it if you want.

### Test 9. The accounting helper

This one needs a Portkey key in `.env`. Without one the panel says so.

1. Click **Ask**, bottom right of any page.
2. Try *"Why does a settlement debit Prepayment Client?"* for the method, or
   *"What was my revenue this year?"* for a figure read out of the journal.

Under each answer the panel names the tools it used and the tokens it spent.
It will not state a figure it was not given.

---

## What to look at

| Page | What it shows |
|---|---|
| **Journal Entries** | Post from 16 templates or by hand. Try template `A1`, a down payment. An undo button appears for six seconds. Cancelling never deletes: the row stays with a void marker |
| **Clients** | Register a project before journalling against it. A registered project is what lets a final settlement find its deposit |
| **P&L** | By month or full year, with Excel and CSV download |
| **Balance Sheet** | Closing balances by month. The difference is always zero |
| **Accounting helper** | The chat panel, bottom right of every page. Needs a key |

The posting rules are deterministic Python, not model output. The chatbot is the
only part of the app that calls an AI model.

If you would rather be told exactly what to type, use the nine scenarios above
instead of this table.

---

## Checking the safety claims without a key

The grounding check is the main safety argument in Section 6 of the report. It
runs offline, with no model calls and no key:

```bash
backend/.venv/bin/python backend/tests/test_grounding.py
```

```
10 as expected, 0 not
```

The other three tests do call the model, so they need a key:

```bash
backend/.venv/bin/python backend/tests/test_hops.py
backend/.venv/bin/python backend/tests/test_output.py
backend/.venv/bin/python backend/tests/test_long_question.py
```

See [`backend/tests/README.md`](backend/tests/README.md) for what each one
answers.

---

## If something does not work

| What you see | What it means |
|---|---|
| `Address already in use` on 8000 | Something else holds the port. Stop it, or run `uvicorn main:app --port 8001` and change the target in `web/vite.config.ts` to match |
| Vite starts on **5174** instead of 5173 | 5173 was busy. Use the URL Vite prints; the app works the same |
| `Error loading ASGI app. Could not import module "main"` | You are not in `backend/`. `cd backend` first |
| `Cannot reach the accounting API` in the browser | The first terminal is not running, or it is not on port 8000 |
| The chat says it is not connected | No key in `.env`. Expected, and everything else still works |
| `Portkey rejected the API key` | The key in `.env` is wrong or expired. Fix it and restart the API |
| You want to start over | Stop the API, delete `backend/berbeda.db`, start it again, re-run `seed_demo.py` |

---

## Layout

```
accounts.json        17 accounts, the chart of accounts
templates.json       16 posting templates
backend/             FastAPI, SQLite, the agent and its tools
  seed_demo.py       invented demo data, posted through the real rules
  tests/             evidence for the claims in the report
web/                 React, Vite, TypeScript
output/              the report, the deck, and the source documents behind them
```

`accounts.json` and `templates.json` at the root are the single source of truth.
Both the Python engine and the TypeScript preview read them.

API docs, generated from the code, are at <http://127.0.0.1:8000/docs> once the
API is running.

---

## Documents

| File | What it is |
|---|---|
| [`output/report.html`](output/report.html) | The project report, 15 printed pages |
| [`output/slides.html`](output/slides.html) | The slide deck, 10 slides |
| [`output/transaction_template.md`](output/transaction_template.md) | The posting templates and how they were derived |
| [`output/feasibility_prompt.md`](output/feasibility_prompt.md) | The feasibility analysis that started the project |
| [`output/user_acceptability_test.md`](output/user_acceptability_test.md) | UAT, eleven findings over four rounds |
| [`AI_prompts.md`](AI_prompts.md) | Every prompt used to build this, and what each produced |

## Notes

- **Both HTML files are self-contained.** Double-click either one and it opens
  with every screenshot showing, on any computer, with or without an internet
  connection. The screenshots, the diagram, the Anton typeface and reveal.js
  are all embedded in the file itself. `slides.html` bundles reveal.js 5.1.0,
  which is MIT licensed, Copyright Hakim El Hattab.
- The model is pinned to `gpt-6-luna`. See [`AGENTS.md`](AGENTS.md).
- `backend/berbeda.db` and `.env` are gitignored. The repository holds no
  business data and no key.
