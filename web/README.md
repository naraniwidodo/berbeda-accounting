# Berbeda — front end

React + Vite + TypeScript. Talks to the FastAPI backend — **start that first**,
or every page will say the API is not answering.

```bash
# terminal 1 — API
cd ../backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# terminal 2 — website
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

Vite proxies `/api` to port 8000, so the browser calls are same-origin and
there is no CORS to think about.

## Pages

| Route | Page |
|---|---|
| `/` | Home — the three panels, plus where the book stands |
| `/company` | Company Profile — description, reach, collaborations, photo slideshow |
| `/journal` | Journal Entries — template dropdown, preview, posted journal |
| `/pnl` | Profit & Loss — full year or a single month |
| `/balance-sheet` | Balance Sheet — closing balances, full year or a single month |

The nav bar is always present, so any page is one click from any other.

## Structure

| File | Role |
|---|---|
| `src/data/*.json` | Chart of accounts and the 20 templates (copied from the project root) |
| `src/lib/api.ts` | every call to the backend, and the wire types |
| `src/lib/engine.ts` | posting rules — used **only** to preview an entry as you type |
| `src/lib/store.ts` | journal state, fetched from the API |
| `src/lib/lock.ts` | period lock state, fetched from the API |
| `src/components/Chat.tsx` | the accounting helper panel |
| `src/lib/reports.ts` | P&L and Balance Sheet derivation |
| `src/lib/excel.ts` | `.xlsx` export, Journal sheet matching the source book |

`src/data/*.json` are copies. When the templates change, re-copy them:

```bash
cp accounts.json templates.json web/src/data/
```

## Adding slideshow photos

The Company Profile slideshow reads from one array at the top of
`src/pages/CompanyProfile.tsx`. Drop a file in `public/company/` and add a line:

```ts
{
  src: '/company/studio-03.jpg',
  alt: 'What the photo shows',
  caption: 'Who it is with, and anything worth saying about them',
  position: 'center 30%',
}
```

`caption` renders under the frame and changes with the slide; omit it and the
line simply does not appear.

The frame is **3:4**. Portrait photos fill it; set `position` (CSS
`object-position`) if the subject would otherwise be cropped through.

A landscape photo cannot fill a 3:4 frame without losing its left and right
edges, which on a group shot means losing people. For those, add
`fit: 'contain'` — the whole photo shows inside the frame with a neutral band
above and below:

```ts
{ src: '/company/team.jpg', alt: '…', fit: 'contain' }
```

Convert from HEIC and bound the long edge to ~1600px before adding; nothing is
resized in the browser.

Slides advance every 5s, crossfading. Auto-advance pauses for anyone who has
asked for reduced motion; the dots still work.

## Design

Two photographs of painting work used to sit at the top of Home; they were
removed so the three panels lead the page. The files are still in
`public/work/`.

Palette and display type come from the BERBEDA brand guideline, which is not in
this repository because it is a third-party document with all rights reserved:
teal `#0a9294`, rust `#bc3f17`, amber `#f09d02`, cream `#ead9a6`, deep teal
`#025e73`, mint `#95cfbb`.

White carries the layout — every number sits on plain white. Brand colour is
reserved for chrome, accents and the Dr/Cr distinction. Body type is
Calibri-metric (Calibri → Carlito → system); Anton is used only for display
headings.

## Where the rules live

On the server. The browser shows a live Dr/Cr preview as you type, using
`engine.ts`, but that is a convenience — the request carries **inputs, not
lines**, and the backend renders the entry again from the same template and
refuses it if it does not balance.

The same goes for everything else: transaction numbers are assigned by the
database, cancellation keeps the row, and a closed period refuses changes. The
greyed-out buttons here are a courtesy; the guarantee is the `409`.

## Period lock

One lock covers the period, not a statement, so the P&L and Balance Sheet are
always closed together — net income flows from one into the other, and freezing
only one would leave them describing different periods.

The lock works by refusing to change a closed period rather than by
snapshotting numbers:

- nothing dated on or before the lock can be posted
- nothing already in it can be cancelled

A closed month therefore cannot drift, and no second copy of the figures is
stored. Closed months are tinted on both statements.

Unlocking needs the password (PBKDF2-SHA256, 150k iterations, random salt).
For a single user that is friction rather than security — the audit value is in
the log, which records every lock, unlock and password change with a timestamp
and an optional reason.

## Undo

For six seconds after an entry is posted, an Undo button appears beside the
form with a countdown ring.

**Undo cancels — it does not erase.** Nothing in this app deletes, so the row
stays with the reason *"Undone by the user moments after posting"* against it,
and its transaction number stays spent. That is deliberate: a ledger where a
number can silently disappear is a ledger you cannot reconcile.

A true delete would have meant either breaking the append-only rule or holding
the entry client-side for six seconds before saving — and that second option
means a window where the user believes the entry is recorded and it is not.
Cancelling is the honest version.

## Downloads

The Journal page offers a period (all, a year, or a single month — built from
what has actually been posted) and a format, Excel or CSV. The journal file
keeps the source workbook's ten columns, so it drops into the existing
process.

Cancelled entries are **included and marked**, not filtered out. A file that
quietly omitted them would not reconcile against the app, and the gap in the
numbering would look like a missing entry.

The P&L and Balance Sheet take their period from the year and month pickers
already on the page, so their download bar offers the format only. The file
matches what is on screen: twelve columns plus YTD for a full year, one column
when a month is selected.

Picking a period with nothing in it writes no file and says so, rather than
handing over an empty one.

## The accounting helper

Bottom-right on every page, so it is reachable while auditing a statement —
which is the moment someone actually wants it.

It can explain the method and read your P&L and Balance Sheet by period. What
it cannot do is invent: the server checks every figure in a reply against what
the tools actually returned, so a real total cannot appear beside a plausible
made-up one. Ask for something the statements do not carry — a vendor
breakdown, who owes the most — and it says so and points at the Journal.

## Persistence

SQLite, on the server, at `backend/berbeda.db`. To start over, stop the API,
delete that file and restart.
