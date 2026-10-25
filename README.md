# Berbeda Accounting

Automated journal entries, P&L and Balance Sheet for **Ber.be.da**, a custom
painting business in Indonesia, with an AI accounting assistant.

Built by Nur Maharani (Rani) for AI Foundations, Cohort Silver.

> **Start here:** [`output/report.html`](output/report.html) is the full project
> report. Download it and open it in a browser. Every image is embedded, so it
> works offline.

---

## What it does

Pick a transaction from a list, and the app writes the journal entry, builds the
P&L and the Balance Sheet, and answers accounting questions about them.

| Page | What it does |
|---|---|
| Client Registration | Register a project before journalling against it |
| Journal Entries | Post from 16 templates, or by hand; undo, cancel, download |
| Profit & Loss | By month or full year, with downloads |
| Balance Sheet | Closing balances, same filters |
| Accounting helper | A chat panel on every page |

The posting rules are deterministic Python, not model output. The chatbot is the
only part that calls an AI model.

## Running it

You need Python 3.12+, Node 20+, and a Portkey API key.

```bash
git clone https://github.com/naraniwidodo/berbeda-accounting.git
cd berbeda-accounting
cp .env.example .env          # then put your own key in .env
```

**Terminal 1, the API:**

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2, the website:**

```bash
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. API docs are at <http://127.0.0.1:8000/docs>.

The database is created on first run and starts empty. Register a client, then
post an entry.

> Without a key, every page except the chatbot still works. The chat panel will
> say it is not connected.

## Layout

```
accounts.json        17 accounts, the chart of accounts
templates.json       16 posting templates
backend/             FastAPI, SQLite, the agent and its tools
  tests/             evidence for the claims in the report
web/                 React, Vite, TypeScript
output/              the report and the source documents behind it
```

`accounts.json` and `templates.json` at the root are the single source of truth.
Both the Python engine and the TypeScript preview read them.

## Tests

```bash
backend/.venv/bin/python backend/tests/test_grounding.py      # no model calls
backend/.venv/bin/python backend/tests/test_hops.py           # calls the model
backend/.venv/bin/python backend/tests/test_output.py         # calls the model
backend/.venv/bin/python backend/tests/test_long_question.py  # calls the model
```

See [`backend/tests/README.md`](backend/tests/README.md).

## Documents

| File | What it is |
|---|---|
| [`output/report.html`](output/report.html) | The project report |
| [`output/slides.html`](output/slides.html) | The slide deck |
| [`output/transaction_template.md`](output/transaction_template.md) | The posting templates and how they were derived |
| [`output/feasibility_prompt.md`](output/feasibility_prompt.md) | The feasibility analysis that started the project |
| [`output/user_acceptability_test.md`](output/user_acceptability_test.md) | UAT, eleven findings over four rounds |
| [`AI_prompts.md`](AI_prompts.md) | Every prompt used to build this, and what each produced |

## Notes

- The model is pinned to `gpt-6-luna`. See [`AGENTS.md`](AGENTS.md).
- `backend/berbeda.db` is gitignored. The repository holds no business data.
- Screenshots in the report show real transactions, published with the owner's
  consent.
