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

- The model is pinned to `gpt-6-luna`. See [`AGENTS.md`](AGENTS.md).
- `backend/berbeda.db` and `.env` are gitignored. The repository holds no
  business data and no key.
