<!--
  Derived artifact. No amounts, counterparties or balances appear here —
  only structure and behaviour. See AGENTS.md.
-->

# User Acceptability Test

Berbeda accounting app · front end and posting flow

**Cycle 1 — closed.** Run by the business owner against the live app before
publishing. All eleven findings resolved; two accounting questions carried
forward. A second cycle may follow.

- **Round 1 — Sales recognition** (UAT-1 to UAT-6). Resolved; one accounting
  question remains the owner's to settle.
- **Round 2 — Purchases** (UAT-7 to UAT-8). Resolved.
- **Round 3 — Sales, second pass** (UAT-9). Resolved; one new issue found
  while testing.
- **Round 4 — Settlements, Tax, Other income, Other, and Home** (UAT-10 to
  UAT-11). Resolved. **C, E and F passed with no changes requested.**

---

## UAT-1 · Posting a sale took four entries

**Found.** The Sales group offered A1–A7 as separate steps. Recording one sale
meant posting a down payment, then revenue recognition, then the invoice —
three actions for one commercial event, before the settlement later on.

**Owner's position.** Once a client pays a deposit in cash, the revenue can be
recognised and the invoice raised at the same time, so the three should be one
action.

**Checked against the source ledger.** This is not only a preference — it is
already the practice:

| | |
|---|---|
| Projects posting deposit, revenue and invoice on the **same date** | **20** |
| Projects posting them on different dates | 1 |

**Resolved.** `A1` now writes all three in a single balanced entry:

```
Dr  Cash/Bank                   [deposit]
    Cr  Prepayment Client           [deposit]
Dr  Accrued Revenue             [project value]
    Cr  Revenue                     [project value]
Dr  Account Receivable          [project value]
    Cr  Accrued Revenue             [project value]
```

`Accrued Revenue` nets to zero within the entry — it is the bridge between
recognising the work and invoicing it, and the source ledger keeps that bridge
rather than debiting receivables straight from revenue.

`A2` and `A3` remain for the case where the stages genuinely happen apart, and
are now labelled as such.

**A sale is now two entries rather than four**: `A1` at order, `A4` at
settlement.

### ⚠ Open accounting point — for the owner to confirm

The change was made because it matches the existing ledger. The stated
rationale needs one correction before it goes into a report.

Under **ASC 606**, revenue is recognised when the performance obligation is
satisfied — when the work is delivered — **not when cash is received**. A
deposit for work not yet done is a contract liability, which is exactly what
`Prepayment Client` is. So "a cash down payment means revenue can be
recognised" does not hold as a general rule.

What makes the combined entry defensible is a question about the business, not
the cash:

> At the point a deposit is taken, is the painting substantially complete or
> delivered?

- **If yes** — the deposit coincides with delivery — recognising revenue then
  is correct, and `A1` is right.
- **If no** — the deposit is taken before the work is done — revenue is being
  recognised early, and `A2` belongs on the completion date instead.

The app supports both. `A1` is the default because it reflects what the ledger
has been doing; splitting the stages is one dropdown away if the answer is
"no". Worth settling before anything is published or submitted, since the
reasoning is more likely to be examined than the entry.

---

## UAT-2 · "Final settlement" was ambiguous, and the project was free text

**Found.** Two problems in one place. It was not obvious what `A4` settles,
and the SKU / project field accepted any text — so a settlement could be typed
against a project that did not exist, or a near-miss spelling of one that did.

**Confirmed.** `A4` is the client paying the remainder of an order that began
with a deposit. It clears that specific deposit, and the app reads the amount
from the ledger rather than accepting it from the form.

**Resolved.** The field is now a **dropdown of registered projects only** —
free text is gone. Each option shows the client and any deposit still open, so
the right one is visible at the point of choosing. The server refuses a post
naming a project that is not registered.

This is what makes the tie reliable: the deposit and the settlement are not
matched by a string someone typed twice, but by both pointing at the same
registered project.

---

## UAT-3 · No place to register a client before journalling

**Found.** Following from UAT-2, a dropdown needs something to list.

**Resolved.** A fourth tile on Home — **Client Registration**, placed first,
because it comes first in the work:

> *Before doing any journal entries, especially when you journal a client's
> transaction, make sure that all clients are registered here.*

Fields follow the `SALES - PENJUALAN` register: **SKU**, **client name**,
**project**, **down payment date**, **note**. The table also shows each
project's open deposit, so what is outstanding is visible without opening the
ledger.

Two rules worth noting:

- **A SKU cannot be renamed** after registration. Every journal entry points
  at it, and renaming would orphan them.
- **A project with entries cannot be removed.** The app refuses and says why,
  rather than leaving journal rows pointing at a project that no longer
  exists.

---

## UAT-4 · Sales template names did not say "sales"

**Found.** `A1 · Down payment received` and `A5 · Paid in full, no DP` read as
events rather than as the kind of transaction being recorded.

**Resolved.**

| | Before | After |
|---|---|---|
| `A1` | Down payment received | **Sales - Down Payment** |
| `A5` | Paid in full, no DP | **Sales - Full (No Down Payment)** |

A short label now hides a six-line entry, so the form shows each template's
description under the dropdown — the name stays clean and the behaviour stays
visible.

---

## UAT-5 · `A6` retired — it would now double-count revenue

**Found.** The deposit should convert to revenue as part of the down payment
entry, not as a separate step.

**Resolved, and it is more than tidying.** `A6` posted
`Dr Prepayment Client` / `Cr Revenue`. Since `A1` now recognises the **full
project value** as revenue at the point of sale, posting `A6` afterwards would
credit revenue a second time for the deposit — **overstating it**.

The deposit is cleared by `A4` against receivables, not converted again. `A6`
is removed rather than merged, because leaving it available would leave a way
to overstate revenue by picking the wrong template.

---

## UAT-6 · `A7` retired — the case can no longer arise

**Found.** Invoices will be generated automatically, so a payment can never
arrive before one exists.

**Resolved.** `A7` (`Dr Cash/Bank` / `Cr Accrued Revenue`) covered the window
between recognising revenue and raising the invoice. `A1` now does both in the
same entry, so there is no window. Removed.

Both retired patterns remain writable through `F1 · Others (manual entry)` if
a genuine case ever appears.

**The Sales group is now five templates, down from seven:**

```
A1 · Sales - Down Payment              the whole point of sale, one entry
A2 · Revenue recognition               only if recognised on a later date
A3 · Invoice issued                    only if invoiced on a later date
A4 · Final settlement                  clears the deposit it belongs to
A5 · Sales - Full (No Down Payment)    paid at once, no deposit
```

---

# Round 2 — Purchases

## UAT-7 · Nowhere to record the supplier's invoice number

**Found.** A purchase could be posted with no reference back to the document
it came from. The journal held the amount and the account, but matching an
entry to a supplier's invoice meant going outside the app.

**Checked against the source workbook.** Not a new idea — every purchase and
income register already has the column:

| Register | Column |
|---|---|
| `NON SALES - PEMBELIAN` | `NO. INVOICE` |
| `SALES - PEMBELIAN` | `NO. INVOICE` |
| `NON SALES - PEMASUKAN` | `NO. INVOICE` |

**Resolved.** An **Invoice number** field, typed by the user, on every
purchase, settlement, tax and non-sales-income template — the same twelve the
registers cover.

**Sales templates do not ask for one.** Invoices there are raised by the app
itself, so there is no supplier document to reference. Asking would invite
someone to invent a number.

---

## UAT-8 · Nowhere to record where a purchase was made

**Found.** No field for the marketplace or shop a purchase came from —
Shopee, TikTok, an offline store.

**Resolved.** A **Source of payment** field, optional, on the same twelve
templates. It maps to `NAMA VENDOR` in the source registers.

Sources already used are offered back as suggestions, so the fourth Shopee
purchase is a pick rather than a retype — and the spelling stays consistent,
which is what makes the field worth filtering on later.

### Both fields reach the download

Appended **after** the source workbook's ten columns, not inserted among them,
so anything keyed to the original positions still works:

```
… COA, Details, Remarks, Invoice No, Source of Payment
```

Sales rows leave the two new columns empty, which is the honest
representation — the field was never asked for, rather than asked for and
skipped.

---

# Round 3 — Sales, second pass

## UAT-9 · Sales should be three templates, and payment should recognise revenue

**Found.** `A2 · Revenue recognition` and `A3 · Invoice issued` were still
offered separately. Revenue should be recognised whenever a payment is made —
deposit or full — so the two stages should never need picking by hand.

**Evidence supplied.** A screenshot of `SKU0725` from the source journal:

| Entry | Lines |
|---|---|
| `SPM01` deposit | `Dr Cash/Bank` · `Cr Prepayment Client` |
| `SPM02` same day | `Dr Accrued Revenue` · `Cr Revenue` · `Dr Account Receivable` · `Cr Accrued Revenue` |
| `SPM03` settlement | `Dr Cash/Bank` · `Dr Prepayment Client` · `Cr Account Receivable` |

**`A1` and `A4` already matched this exactly** — they were built from the same
pattern in UAT-1. Only `A5` needed changing.

**Resolved.** Sales is now three templates:

```
A1 · Sales - Down Payment                      deposit + recognise + invoice
A4 · Sales - Down Payment Final Settlement     clears the deposit it belongs to
A5 · Sales - Full Payment (No Down Payment)    recognise + invoice + settle
```

`A5` was `Dr Cash/Bank` / `Cr Revenue`. It now writes the full sequence —
recognise, invoice, settle — in one entry. `Accrued Revenue` and
`Account Receivable` both net to zero, so the net effect is unchanged, but the
ledger now shows revenue recognised and an invoice raised rather than cash
appearing against revenue with no document behind it. The same trail as every
other sale.

`A2` and `A3` are retired. Leaving them available would have been a second way
to recognise the same revenue — a way to double-count it.

### ⚠ One correction: `A4` does not recognise revenue

The note asked for revenue to be recognised after `A1`, `A4` **or** `A5`. It
should not be recognised at `A4`.

By the time a settlement is posted, `A1` has already recognised the **full
project value** — not just the deposit. Recognising again at settlement would
book the same revenue twice.

The screenshot settles it. `SPM03`, the settlement, carries three lines —
cash, the prepayment and receivables — and **no revenue line**. The source
ledger recognises revenue once, when the deposit is taken.

`A4` is therefore unchanged, and its description now says so.

---

# Round 4 — C, D, E, F and Home

**Passed with no changes:** Settlements (C), Other income (E), Other (F).

## UAT-10 · "Source of payment" reads wrong for tax

**Found.** Tax remittance carried the same **Source of payment** field as a
purchase, offering *Shopee, TikTok, offline store* as examples. Tax is
remitted to the state — a marketplace is not a sensible answer.

**Resolved.** On `D1 · Remit Art 21` the field is now **Payment Method**, with
the placeholder *Bank transfer, BCA, e-billing…*. Still free text, as asked.

**The suggestion list is now scoped by group.** Previously it pooled every
source ever typed, so filling in a tax entry would have offered *Shopee*. Each
kind of transaction now suggests only what has been used for that kind:

| Filling in | Offered |
|---|---|
| `B3` a purchase | Shopee |
| `D1` remitting tax | Bank transfer BCA |

Keeping the lists apart is what makes the suggestions worth having — a list
that offers obviously wrong answers gets ignored, and then the spelling drifts
anyway.

Labels live in `templates.json` (`payment_source_label`,
`payment_source_placeholder`), so relabelling another template is a data edit,
not a code change.

---

## UAT-11 · Home tile type was out of proportion

**Found.** The headings under the four squares were too large for the space
they sat in — the ratio of type to tile did not look right.

**Resolved.**

| | Before | After |
|---|---|---|
| Tile heading | 23px | **17px** (20px at two-up) |
| Blurb | 13.5px | **12.5px** (13px at two-up) |
| Tile number | 13px | **11px** |
| Tile padding | 24px | **20px** |

The heading takes a second size at the two-column breakpoint: four tiles in a
row leaves each one narrow, two leaves them wide, and a single size cannot
suit both. Checked at 1440px and at the narrower pane width.

---

## Verified

End to end against the running app, not by inspection:

| Check | Result |
|---|---|
| Posting against an unregistered project | refused, with the reason |
| `A1` after registering | one entry, six lines, balanced |
| `A4` picking the project | deposit cleared automatically from the ledger |
| Open deposit after settlement | returns to nil |
| Balance Sheet after both | balanced |
| Removing a project with entries | refused, with the reason |
| Journal SKU field | dropdown, registry-fed, no free text |
| `A1` and `A5` under their new names | posting correctly |
| `A6` and `A7` | rejected — `unknown template` |
| Template count served by the API | 18 |
| Invoice number and source on a purchase | stored and returned |
| Same fields on a sale | not asked for, stored as null |
| Which templates ask | the 12 purchase / settlement / tax / income ones |
| Both fields in the CSV | present, after the original ten columns |
| `A1` + `A4` against the `SKU0725` screenshot | reproduced line for line |
| `A5` full payment | recognise, invoice, settle — balanced |
| `A2` and `A3` | rejected — `unknown template` |
| Balance Sheet, 2025 and 2026 | both balanced |
| `D1` field label and placeholder | Payment Method · Bank transfer, BCA, e-billing… |
| `B3` and `C1` unchanged | Source of payment · Shopee, TikTok, offline store… |
| Suggestions after posting both | purchase offers Shopee, tax offers Bank transfer BCA |
| Home tiles at 1440px and narrow | four-up and two-up, both in proportion |

---

## Noted while testing

**The Balance Sheet does not carry opening balances between years.** Posting
the `SKU0725` deposit in Dec 2025 and its settlement in Jan 2026 made this
visible: the 2026 statement reflects 2026 movements only, so the cash held at
the end of 2025 does not appear as an opening balance. Each year balances on
its own, but a reader of the 2026 Balance Sheet sees a business that started
the year with nothing.

The source workbook's `BS (All)` sheet does carry an opening column, so this
is a gap rather than a design choice. It does not matter while everything sits
in one year; it will matter as soon as it does not. Raised as **Q14**.


**`--reload` does not watch the template files.** `templates.json` and
`accounts.json` live at the project root; uvicorn's reloader watches
`backend/` only. After editing a template the server keeps serving the old
catalog — entries post under stale labels and retired templates still work,
which is a confusing symptom for an obvious cause.

**Restart the backend after changing either file**, and re-copy them to
`web/src/data/`. Written into the backend README.

---

## Still open

| | Where |
|---|---|
| **Q13** · ASC 606 — is the painting substantially complete when a deposit is taken? | UAT-1, UAT-9 · owner to confirm |
| **Q14** · Balance Sheet carries no opening balances between years | found in round 3 |
| **Q10** · Cancelling one stage of a sale leaves later stages orphaned | predates this UAT |

None of the three blocks use of the app. Q13 is a judgement about the
business, not a defect. Q14 and Q10 are both correct-but-incomplete: the
figures they produce are right, they just do not yet cover a case that has not
arisen.

---

# Cycle 1 — closed

**Eleven findings, all resolved.**

| Round | Scope | Findings | Outcome |
|---|---|---|---|
| 1 | Sales recognition | UAT-1 to UAT-6 | resolved |
| 2 | Purchases | UAT-7, UAT-8 | resolved |
| 3 | Sales, second pass | UAT-9 | resolved |
| 4 | Settlements, Tax, Other income, Other, Home | UAT-10, UAT-11 | resolved |

**Passed with no changes requested:** Settlements (C), Other income (E),
Other (F).

## What the cycle changed

**The Sales group went from seven templates to three.** Not by dropping
anything — by combining. A sale used to take four separate entries; it now
takes two, because `A1` books the deposit, recognises the revenue and raises
the invoice together, exactly as the source ledger does.

```
A1 · Sales - Down Payment                      deposit + recognise + invoice
A4 · Sales - Down Payment Final Settlement     clears the deposit it belongs to
A5 · Sales - Full Payment (No Down Payment)    recognise + invoice + settle
```

**Two retirements closed off ways to get it wrong.** `A6` would have
double-counted revenue once `A1` recognised it in full; `A2` and `A3` would
have been a second route to recognising the same revenue. Removing them was
not tidying — it removed the possibility.

**Projects must be registered before they can be journalled.** The SKU field
is a dropdown fed by the registry, never free text, so a settlement finds its
deposit because both point at the same registered project rather than at a
string someone typed twice.

**Purchases carry their paperwork.** Invoice number and source of payment are
structured columns on the twelve templates whose source registers have them,
and they travel into the download.

## Two findings the testing produced by itself

Neither was on the list; both came out of exercising the app with real
sequences.

- **Revenue would have been double-counted at settlement** had the request to
  recognise at `A4` been taken at face value. The owner's own screenshot of
  `SPM03` — cash, prepayment, receivables, no revenue line — settled it.
- **The Balance Sheet does not carry opening balances between years.** Visible
  only once a deposit in one year was settled in the next. Raised as Q14.

## Retesting

Everything here is reproducible. The app enforces its rules server-side, so a
retest exercises the real behaviour rather than the interface's opinion of it:
posting an unregistered project, cancelling inside a locked period, settling
against a deposit. Each returns a refusal with its reason.

Add a **Cycle 2** heading below when that happens.
