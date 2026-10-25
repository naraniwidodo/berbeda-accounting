# PT GORAN Accounting System — Feasibility Assessment & Build Plan

**Date:** 22 Oct 2026
**Source data:** `REKAPAN 2026 PT GORAN.xlsx` (1.5 MB, 33 sheets)

---

## 1. Verdict

**Feasible, and the data is in good shape.** The workbook is already a real
double-entry system — not a cashbook pretending to be one. That is the single
biggest risk retired before the project starts.

The important finding is that this is **less of an AI problem than expected**.
Roughly 90% of the journaling follows fixed, deterministic posting templates.
The AI belongs on the remaining 10% — classifying free-text descriptions into
accounts. See §4.

---

## 2. What the data actually looks like

### Journal sheet (the general journal)

| Metric | Value |
|---|---|
| Rows in sheet | 1,116 |
| Section-header rows (SKU banners) | 12 |
| Fully blank rows | 114 |
| Journal line rows | 990 |
| **Complete double-entry lines** (Dr/Cr + amount + COA) | **813** |
| Distinct transaction numbers | 204 |
| Date range | 29 Nov 2025 – 29 Nov 2026 |
| Accounts in use | 15 |

Columns: `Date | Month | Year | Transaction Details | Transaction Numbers |
Rp | Debit/Credit | COA | Details | Remarks | Note Akuntansi | Question`

**This is a clean schema.** It maps to a database table almost 1:1.

### Chart of accounts (`CoA` sheet)

Two generations exist — `COA Mapping [OLD]` and `COA Mapping [NEW]`. The NEW
mapping is a clean two-level structure, which is exactly right:

**Level 1 — GL account (17):**

| Type | Accounts |
|---|---|
| Asset | Cash/Bank, Account Receivable, Accrued Revenue, Prepayment Vendor, Inventory |
| Liability | Account Payable, Prepayment Client, Art 21, Art 26, Other Tax |
| Equity | Modal, RE |
| Revenue | Revenue |
| Expense | COGS, S&D, OPEX, Marketing |

**Level 2 — detail/sub-category (23):** Jasa Lukis, Canvas, Sepatu/Jaket,
Special Request, Operasional, Biaya, Packaging & Card, Pengiriman, Office Exp.,
Wages & Salaries, Freelance Fee, Ads, Marketing Others, RnD, Rent,
Entertainment & Travel, Bank Fee, Art 21, Art 26, Other Tax, Inventory,
Write Off, Others

### The four "ledgers"

These are **not ledgers** — they are *source registers* (subsidiary journals),
and recognising that is what makes the app design fall out cleanly:

| Sheet | Rows | Role | ID prefix |
|---|---|---|---|
| SALES - PENJUALAN | 990 | Sales to clients | `SPM` |
| SALES - PEMBELIAN | 1,976 | Purchases attributable to a client/SKU | `SPB` |
| NON SALES - PEMBELIAN | 988 | General purchases / opex | `NSPB` |
| NON SALES - PEMASUKAN | 1,000 | Other income | `NSPM` |

A true ledger is a *view* of the journal grouped by account. These four sheets
are where transactions are **entered**; the Journal is what they **produce**.

`SALES - PENJUALAN` even has a `Journal` column currently reading `True` —
a manual flag tracking "has this been journaled yet?". **That flag is the
automation target.** The work is already identified; it just isn't automated.

---

## 3. Data quality findings

### 3.1 The book does not balance ⚠️

Total debits and total credits do not agree. The difference is small relative
to turnover, but in double-entry any non-zero figure is a bug.

**It is fully localised** — the whole difference sits in a single account
(`Prepayment Client`) and a single register (sales). Every other account either
nets correctly or reconciles exactly. So the defect is in **client down-payment
handling**, not scattered through the book.

### 3.2 Transaction numbers are mislabelled — but the journal itself is correct

Many transaction groups don't reconcile, and **most are not real
differences.** The pattern looks like this:

```
SPM22  Dr  Accrued Revenue   [amount]
SPM23  Cr  Revenue           [amount]   <-- same entry, different label
```

The debit and its matching credit were tagged with different transaction
numbers. The same off-by-one repeats across many pairs, where the two sides
cancel exactly.

**Root cause: there is no stable journal-entry ID.** Lines are paired by being
*next to each other on screen*, not by a key. Excel cannot enforce this; a
database can and will. This single change eliminates the whole error class.

### 3.3 Smaller issues

| Issue | Count | Fix |
|---|---|---|
| Rows with Dr/Cr but **no amount** | 22 | Incomplete entries — review and complete |
| Section-header rows inside the data | 12 | Becomes a real column, not a banner row |
| Fully blank spacer rows | 114 | Disappears in a DB |
| `Date` column mixes datetime and text | 132 text | Single typed DATE column |
| Dates landing in **1899-12** | — | Excel epoch artifact (time without date) |
| SKU naming drift (`SKU0725` vs `SKU2725`) | — | Foreign key to a SKU table |
| `Art 21` vs `NSPB` cross-register gap | ±320,767 | Offsetting — tax withholding tagged to the wrong register |
| Unused sheets (`Sheet30`, `Sheet43`, `NOT USED …`) | ~8 | Not migrated |

### 3.4 Overall grade

**B+.** Every problem found is a *structural* consequence of using a
spreadsheet — no entry IDs, no type enforcement, no balance constraint. None
of them are conceptual accounting errors. The bookkeeping thinking is sound;
the tool is what's failing. That is the ideal starting point, because the
database fixes the structural problems by existing.

---

## 4. The key design insight

The posting patterns in the journal are **highly repetitive and deterministic**.
Extracted from the data:

| Event | Journal entry |
|---|---|
| DP received | `Dr Cash/Bank` / `Cr Prepayment Client` |
| Revenue recognition | `Dr Accrued Revenue` / `Cr Revenue` |
| Invoice issued | `Dr Account Receivable` / `Cr Accrued Revenue` |
| Final settlement | `Dr Cash/Bank` + `Dr Prepayment Client` / `Cr Account Receivable` |
| Purchase on credit | `Dr <Expense>` / `Cr Account Payable` |
| Payment to vendor | `Dr Account Payable` / `Cr Cash/Bank` |
| Tax withheld | `Dr <Expense>` / `Cr Art 21` |

**These do not need an LLM.** They need a rules engine — and a rules engine is
100% reliable, instant, free, and auditable.

What genuinely *does* need AI is the judgment call:

> `"02/01/26 Pembelian Kawat tanaman 12.421"`
> → which account? `COGS` / `OPEX` / `S&D`?
> → which detail? `Packaging & Card` / `Operasional` / `RnD`?

That's real classification under ambiguity, and there are ~1,000 historical
examples in `NON SALES - PEMBELIAN` to use as few-shot context and as an
evaluation set.

### The right split

```
Transaction entered
   ↓
[Rules engine]  decides the posting template      ← deterministic, always right
   ↓
[AI classifier] fills in which expense account    ← judgment, needs review
   ↓
[Validator]     debits == credits, accounts valid ← hard gate, cannot be bypassed
   ↓
[User confirms] one click
   ↓
Journal (append-only)
   ↓
Ledger · Trial Balance · P&L · Balance Sheet      ← all views, no extra storage
```

This is both **more reliable** and **a better project**: the AI is pointed at
the part that actually requires judgment, and its accuracy can be measured
against the existing 1,000 labelled rows.

---

## 5. Build plan

> Superseded by D10 in `AI_prompts.md` — the database and migration were later
> dropped. Kept for the architecture and phasing.

### Data model

```
accounts        (code, name, type, normal_balance, parent_code)
details         (code, name)                    -- level-2 sub-category
clients         (id, name)
vendors         (id, name)
skus            (sku, client_id, project, opened_at)

transactions    (id, date, register, ref_no, sku, counterparty,
                 description, amount, status, created_at)

journal_entries (id, transaction_id, date, memo, posted_at, reversed_by)
journal_lines   (id, entry_id, account_code, detail_code, dr, cr)
                 CONSTRAINT: sum(dr) == sum(cr) per entry_id
```

`journal_entries.id` is the stable key the spreadsheet never had — §3.2 cannot
recur.

### Reports (all derived, nothing stored)

- **Ledger** — `journal_lines` filtered by account, running balance
- **Trial balance** — sum dr/cr grouped by account
- **P&L** — trial balance filtered to Revenue / COGS / S&D / OPEX / Marketing
- **Balance Sheet** — Asset / Liability / Equity, with net income → RE
- **Integrity panel** — live "is the book in balance?" check

### Phases

| # | Phase | Deliverable |
|---|---|---|
| 1 | Schema + CoA seed | 17 accounts, 23 details loaded from the NEW mapping |
| 2 | Migration script | 813 journal lines imported, with a reconciliation report |
| 3 | Reports | Ledger, Trial Balance, P&L, Balance Sheet from migrated data |
| 4 | Rules engine | The 7 posting templates in §4 |
| 5 | Entry UI | Four register forms → proposed entry → confirm |
| 6 | AI classifier | Account/detail suggestion, benchmarked on historical rows |
| 7 | Integrity + polish | Balance gate, append-only enforcement, reversing entries |

Phase 3 is the first point where the project demonstrates value: the same
statements, generated rather than maintained by hand.

### Stack

- **Dash** — UI (per project conventions: `debug=False`, no reloader)
- **SQLite** — single file, zero setup, correct for one entity
- **Portkey / GPT 5.6-luna** — classifier only, key from root `.env`

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Scope creep (tax, multi-currency, payroll, multi-user) | **High** | Out of scope. PPN/PPh columns are mostly empty anyway. |
| AI misclassification | Low | Confirm-before-post; validator gate; measurable against history |
| Real client names in a submitted project | Medium | Anonymise counterparty names for any public artifact |

**The main risk is scope, not difficulty.** The accounting engine is small and
provable. Resist adding tax computation.

---

## 7. Open questions

1. **Single entity, or also "PLBS Consultant" / "Project Social Challenge"?**
   Those sheets suggest more than one book. Multi-entity changes the schema.
3. **Is the 2-level CoA (account + detail) final?** The build assumes yes.
4. **Does the app need to replace the workbook, or run alongside it first?**
   Recommend alongside, so output can be checked against known-good figures.
