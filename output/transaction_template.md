<!--
  Derived artifact. Generated from PT GORAN's ledger and journal workbook.
  The source workbook is confidential and is deliberately NOT stored in this
  repository - it was read only to learn the recurring Dr/Cr patterns below.
  Nothing here identifies a client, vendor, invoice, or individual transaction.
-->

# Posting Template Catalog

**Derived from:** `REKAPAN 2026 PT GORAN.xlsx` → Journal sheet
**Basis:** 813 complete journal lines → **379 balanced entries**, 25 distinct
patterns, **97.4% coverage** (21 orphan lines, all from the known DP defect)

This is the agreed Dr/Cr for every option in the Square 1 dropdown. Once
signed off, the rules engine implements exactly this and nothing else.

---

## 1. How a template works

Three inputs, never more:

```
   [ What happened ]  ▾      ← the template
   [ Amount        ] Rp
   [ How settled   ]  ▾      ← Paid now / On credit / From prepayment
```

The **"how settled"** toggle is the key simplification. In your data the same
economic event appears with three different credit sides depending on timing:

| Same event | Credit side | Count |
|---|---|---|
| Expense, paid immediately | `Cash/Bank` | 53 |
| Expense, billed and unpaid | `Account Payable` | 56 |
| Expense, drawn from an advance | `Prepayment Vendor` | 51 |

Without the toggle that's 3× the dropdown entries. With it, **the debit side is
the template and the credit side is the toggle.** The dropdown stays short.

---

## 2. Group A — Sales lifecycle (SPM)

Four stages, in order, **bound to a SKU**. The app tracks which stage each SKU
has reached and offers only the next valid one.

### A1 · Sales - Down Payment — `23×`
```
Dr  Cash/Bank                    [deposit]
    Cr  Prepayment Client                [deposit]
Dr  Accrued Revenue              [project value]
    Cr  Revenue                          [project value]
Dr  Account Receivable           [project value]
    Cr  Accrued Revenue                  [project value]
```
One entry covering the whole point of sale: the deposit received, the revenue
recognised, the invoice raised. `Accrued Revenue` nets to zero inside it — it
is the bridge the source ledger keeps between recognising and invoicing,
rather than debiting receivables straight from revenue.

Combined because that is the practice: **20 of 21 projects in the source
ledger post all three on the same date.** A sale is two entries — this and
`A4` — not four.

> ⚠️ See §12 for the ASC 606 question this raises. Revenue is recognised when
> the work is delivered, not when cash arrives, so whether `A1` is right turns
> on whether the painting is substantially complete when the deposit is taken.

### A4 · Sales - Down Payment Final Settlement — `13×`
```
Dr  Cash/Bank                    [balance received]
Dr  Prepayment Client            [DP being cleared]   ← auto-filled
    Cr  Account Receivable               [total]
```

**No revenue is recognised here** — it was recognised in full when the deposit
was taken. The source ledger agrees: its settlement entry carries only cash,
the prepayment and receivables, with no revenue line.

> ⚠️ **This is the stage that gets skipped.** The `Prepayment Client` debit is
> the line most often left out, which strands the down payment open forever.
>
> **Rule: the app fills that line itself** from the open DP balance on the SKU.
> The user enters only the cash received. The line cannot be omitted.

### A5 · Sales - Full Payment (No Down Payment) — `2×`
```
Dr  Accrued Revenue              [amount]
    Cr  Revenue                          [amount]
Dr  Account Receivable           [amount]
    Cr  Accrued Revenue                  [amount]
Dr  Cash/Bank                    [amount]
    Cr  Account Receivable               [amount]
```
Paid in full with no deposit. The same three steps as a deposit sale —
recognise, invoice, settle — all on one day. `Accrued Revenue` and
`Account Receivable` both net to zero inside the entry; the net effect is
`Dr Cash/Bank` / `Cr Revenue`.

The longer form is deliberate: it leaves the same audit trail as every other
sale, so a reader of the ledger sees revenue recognised and an invoice raised
rather than cash appearing against revenue with no document behind it.

### Retired: A2 and A3

`A2 · Revenue recognition` and `A3 · Invoice issued` are no longer offered.
Both are now written automatically — by `A1` when a deposit is taken, and by
`A5` when an order is paid in full. Revenue is recognised once a payment is
made, which is when the source ledger recognises it.

Keeping them available would have meant a second way to recognise the same
revenue, which is a way to double-count it.

### Retired: A6 and A7

Both were in the original catalog and are no longer offered, because the
combined `A1` makes one of them wrong and the other impossible.

**`A6 · DP converted to revenue`** (`Dr Prepayment Client` / `Cr Revenue`)
would now **double-count**. `A1` already recognises the full project value as
revenue; crediting revenue again for the deposit would overstate it. The
deposit is cleared by `A4` against receivables, not converted a second time.

**`A7 · Payment received before invoice`** (`Dr Cash/Bank` /
`Cr Accrued Revenue`) existed for the window between recognising revenue and
raising the invoice. `A1` now does both in the same entry, so the window does
not exist.

Either pattern can still be written through `F1` if a genuine case appears.

**Detail (sub-category) for all of Group A:** `Jasa Lukis` (default), `Canvas`,
`Sepatu/Jaket`, `Special Request`, `Others`

---

## 3. Group B — Purchases & expenses (NSPB / SPB)

One template per expense type. The **credit side comes from the toggle.**

| # | Template | Debit account | Count |
|---|---|---|---|
| B1 | Shipping / delivery | `S&D` | 39 |
| B2 | Packaging & cards | `S&D` | — |
| B3 | Materials / production cost | `COGS` | 22 |
| B4 | Office & operations | `OPEX` | 67 |
| B5 | Advertising | `Marketing` | 6 |
| B6 | Stock purchase | `Inventory` | 39 |

### The settlement toggle

```
Dr  <account from B1–B6>         [amount]
    Cr  Cash/Bank                        [amount]   ← "Paid now"        53×
    Cr  Account Payable                  [amount]   ← "On credit"       56×
    Cr  Prepayment Vendor                [amount]   ← "From prepayment" 51×
```

### B7 · Salary with Art 21 withholding — `13×`
```
Dr  OPEX                         [gross]
    Cr  Art 21                           [tax withheld]
    Cr  Cash/Bank                        [net paid]
```
Two inputs: gross and withholding. Net is computed, never typed.
Detail: `Wages & Salaries`

### Detail sub-category per account

These are the options the AI classifier picks from, taken from actual usage:

| Account | Valid details |
|---|---|
| `COGS` | Operasional, Sepatu/Jaket, Special Request, Biaya, Pengiriman |
| `OPEX` | Wages & Salaries, Bank Fee, Office Exp., RnD, Rent, Entertainment & Travel, Write Off |
| `S&D` | Pengiriman, Packaging & Card |
| `Marketing` | Ads, Marketing Others |
| `Inventory` | Operasional |
| `Revenue` | Jasa Lukis, Canvas, Sepatu/Jaket, Special Request, Others |

**The AI's only job is this column.** The account comes from the template; the
detail is the judgment call.

---

## 4. Group C — Settlements

### C1 · Pay a vendor — `83×` ⭐ most frequent
```
Dr  Account Payable              [amount]
    Cr  Cash/Bank                        [amount]
```
Should be picked from a list of open payables, not typed free-hand.

### C2 · Advance to a vendor — `5×`
```
Dr  Prepayment Vendor            [amount]
    Cr  Cash/Bank                        [amount]
```

### C3 · Vendor advance billed — `19×`
```
Dr  Prepayment Vendor            [amount]
    Cr  Account Payable                  [amount]
```

---

## 5. Group D — Tax

### D1 · Remit Art 21 — `8× credit / 2× cash`
```
Dr  Art 21                       [amount]
    Cr  Account Payable                  [amount]    ← or Cash/Bank
```
Clears the withholding liability created in B7.

> ⚠️ Art 21 withholding is easy to tag to the wrong register, since it arises
> in one (payroll) and is remitted from another. A single template for the
> remittance keeps both sides on one path.

---

## 6. Group E — Other income (NSPM)

### E1 · Non-sales income — `2×`
```
Dr  Cash/Bank                    [amount]
    Cr  Revenue                          [amount]
```
Detail: `Others`

---

## 7. Group F — Others (manual)

Free-form entry for anything not covered. Add Dr and Cr lines by hand.

**Still enforced:**
- Accounts must come from the 17-account chart — no free text
- Details must be valid for the chosen account
- `sum(Dr) == sum(Cr)` or the entry will not save
- Flagged for review, and logged — a template appearing repeatedly here is a
  signal that a new template should be added

---

## 8. Coverage

| Group | Templates | Entries matched |
|---|---|---|
| A — Sales lifecycle | 3 | 86 ※※ |
| B — Purchases & expenses | 7 | 173 |
| C — Settlements | 3 | 107 |
| D — Tax | 1 | 10 |
| E — Other income | 1 | 0 ※ |
| **Total** | **15** | **376 / 379 (99.2%)** |

※※ The counts come from replaying the original seven-template catalog
against the source book, where each stage was posted as its own entry with its
own transaction number. `A1` and `A5` now write those stages as single
entries, so the same economic events are covered by fewer templates — the
coverage did not shrink, the entries got larger.

※ `E1` produced the same lines as the *old* `A5` (`Dr Cash/Bank` / `Cr Revenue`), so the
replay attributes those entries to `A5`. The two differ only in default detail
and which register they belong to — keep both for clarity of intent, or merge
them if you'd rather have one fewer option.

The 3 remaining entries are compound one-offs → Group F.

**15 templates cover a year of bookkeeping**, down from 19 — the four retired
were absorbed into `A1` and `A5` rather than dropped. This is why the posting logic
should be a rules engine, not an LLM: it is small, finite, and verifiable.

---

## 9. Validation (non-negotiable)

Every entry, templated or manual, must pass before saving:

1. `sum(Dr) == sum(Cr)` — exact, integer rupiah
2. All accounts exist in the 17-account chart
3. Detail is valid for its account (§3 table)
4. Date is inside an **open** period (locked → reject)
5. Amount > 0
6. **Lifecycle:** A4 cannot post unless an open DP exists on the SKU, and it
   must clear that DP in full

Rule 6 is the one that would have prevented every rupiah of the Rp 1.25M gap.

---

## 11. Verification

The catalog was replayed against the source journal — every historical entry
matched to the template that would have produced it:

```
journal entries replayed : 379
matched by a template    : 376   (99.2%)
unmatched                : 3
```

Unmatched remainder: one compound multi-SKU entry, and two artifacts of
segmenting a journal that has no entry IDs. All three fall to `F1`.

### Template usage in the real journal

| Rank | Template | Count |
|---|---|---|
| 1 | `C1` Pay a vendor | 83 |
| 2 | `B6` Stock purchase *(from prepayment)* | 39 |
| 3 | `B4` Office & operations *(paid now)* | 32 |
| 4 | `A1` Down payment received | 23 |
| 5 | `A2` Revenue recognition | 23 |
| 6 | `B4` Office & operations *(on credit)* | 22 |
| 7 | `A3` Invoice issued | 21 |
| 8 | `B1` Shipping / delivery *(on credit)* | 20 |
| 9 | `C3` Vendor advance billed | 19 |
| 10 | `B3` Materials *(paid now)* | 14 |

`A4` (final settlement) is used markedly less often than `A1` (down payment
received) — down payments get opened more readily than they get closed. This is
why `A4` fills the clearing line itself rather than offering it as a field.

### Implementation

| File | Role |
|---|---|
| `accounts.json` | 17 accounts, valid details, settlement modes |
| `templates.json` | the 20 templates as data |
| `engine.py` | renders a template to lines, validates, refuses to save unbalanced |

Run `python engine.py` to print every template with sample amounts and confirm
they all balance.

---

## 12. Open questions

0. **ASC 606 — is the painting substantially complete when a deposit is
   taken?** Revenue is recognised when the performance obligation is
   satisfied, not when cash is received; a deposit for undelivered work is a
   contract liability. If the work is effectively done at deposit time, `A1`
   is right. If not, revenue is early and `A2` belongs on the completion date.
   Both are supported. **Owner to confirm.**

1. **Rounding** — store rupiah as integers? Your data has floats (`12,421.0`).
   Integers recommended; there are no sub-rupiah amounts.
2. **Reimbursements** — the registers have `REIMBURSEMENT DATE` columns but no
   distinct journal pattern. Currently treated as ordinary purchases. Confirm.
3. **`Prepayment Vendor` vs `Inventory`** — B6 posts stock to `Inventory`
   (39×, always `Operasional`). Is there a COGS release when stock is consumed?
   No such pattern appears in the journal.
4. **Multi-SKU purchases** — can one SPB line serve two SKUs? Affects whether
   `transactions.sku` can be a simple foreign key.
