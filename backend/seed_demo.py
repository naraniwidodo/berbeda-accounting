"""Fill a fresh database with a year of **invented** demo transactions.

Why this exists: a clone starts with an empty journal, so the P&L, the Balance
Sheet and the chatbot's finance tools have nothing to read and look broken when
they are merely empty. This posts a plausible year through the real API, which
means it goes through the real posting rules rather than writing rows behind
their back.

**Nothing here is Ber.be.da data.** The clients, the SKUs and every amount are
made up for the demo. Real figures are confidential and are not in this
repository.

    python3 seed_demo.py                      # against http://127.0.0.1:8000
    python3 seed_demo.py --api http://127.0.0.1:8001 --year 2026

Only the standard library, so it runs with no extra install.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

# Invented clients. Any resemblance to a real Ber.be.da customer is accidental.
CLIENTS = [
    ("DEMO0001", "Alya Pratama", "Painted denim jacket, floral"),
    ("DEMO0002", "Budi Santoso", "Custom sneakers, city skyline"),
    ("DEMO0003", "Citra Lestari", "Tote bag set, three pieces"),
    ("DEMO0004", "Dimas Nugroho", "Wedding shoes, monogram"),
]

#: (month, template, values, extras) - a year that exercises every statement
#: line: sales in stages, purchases on three settlement modes, payroll, tax
#: and non-sales income.
PLAN = [
    # a full sale in stages: deposit in February, settled in March
    (2, "A1", {"dp_amount": 600_000, "project_value": 1_800_000}, {"sku": "DEMO0001"}),
    (3, "A4", {"cash_received": 1_200_000}, {"sku": "DEMO0001"}),
    # a sale paid in one go
    (3, "A5", {"amount": 950_000}, {"sku": "DEMO0002"}),
    # deposit now, settled much later, so the Balance Sheet carries a prepayment
    (4, "A1", {"dp_amount": 500_000, "project_value": 2_400_000}, {"sku": "DEMO0003"}),
    (7, "A4", {"cash_received": 1_900_000}, {"sku": "DEMO0003"}),
    # a deposit that is still open at year end
    (11, "A1", {"dp_amount": 750_000, "project_value": 3_000_000}, {"sku": "DEMO0004"}),
    # more straight sales
    (5, "A5", {"amount": 1_250_000}, {"sku": ""}),
    (8, "A5", {"amount": 1_600_000}, {"sku": ""}),
    (10, "A5", {"amount": 2_100_000}, {"sku": ""}),
    # costs, across all three settlement modes
    (2, "B3", {"amount": 320_000}, {"settlement": "paid_now", "payment_source": "Toko Kanvas"}),
    (3, "B3", {"amount": 410_000}, {"settlement": "paid_now", "payment_source": "Toko Kanvas"}),
    (4, "B1", {"amount": 85_000}, {"settlement": "paid_now", "payment_source": "JNE"}),
    (5, "B2", {"amount": 140_000}, {"settlement": "on_credit", "payment_source": "Percetakan Mawar"}),
    (6, "B5", {"amount": 300_000}, {"settlement": "paid_now", "payment_source": "TikTok Ads"}),
    (9, "B5", {"amount": 450_000}, {"settlement": "paid_now", "payment_source": "TikTok Ads"}),
    (7, "B4", {"amount": 95_000}, {"settlement": "paid_now", "payment_source": "Warung ATK"}),
    (10, "B3", {"amount": 520_000}, {"settlement": "paid_now", "payment_source": "Toko Kanvas"}),
    # pay off the credit purchase
    (6, "C1", {"amount": 140_000}, {"payment_source": "Percetakan Mawar"}),
    # payroll, then remit the tax withheld
    (6, "B7", {"gross": 1_000_000, "tax": 25_000}, {}),
    (7, "D1", {"amount": 25_000}, {"settlement": "paid_now"}),
    (12, "B7", {"gross": 1_200_000, "tax": 30_000}, {}),
    # a tip
    (8, "E1", {"amount": 150_000}, {}),
]


def call(api: str, path: str, payload: dict | None = None) -> dict:
    url = f"{api}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method="POST" if data else "GET",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        raise SystemExit(f"\n  {path} failed with HTTP {e.code}\n  {body}\n") from e
    except urllib.error.URLError as e:
        raise SystemExit(
            f"\n  Cannot reach the API at {api}.\n"
            f"  Start it first:  cd backend && uvicorn main:app --port 8000\n"
            f"  ({e.reason})\n"
        ) from e


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--year", type=int, default=2026)
    args = ap.parse_args()

    api = args.api.rstrip("/")

    existing = call(api, "/api/entries").get("entries", [])
    if existing:
        print(f"The journal already holds {len(existing)} entries. Nothing seeded.")
        print("Delete backend/berbeda.db and restart the API to start over.")
        return 0

    print(f"Seeding invented demo data for {args.year} into {api}\n")

    for sku, name, project in CLIENTS:
        call(api, "/api/clients", {
            "sku": sku, "client_name": name, "project": project,
            "dp_date": f"{args.year}-02-10",
            "note": "Invented demo client, not real Ber.be.da data.",
        })
    print(f"  {len(CLIENTS)} demo clients registered")

    posted = 0
    for month, template, values, extra in PLAN:
        body = {
            "template_id": template,
            "date": f"{args.year}-{month:02d}-15",
            "values": values,
            "note": "Demo data",
            **extra,
        }
        call(api, "/api/entries", body)
        posted += 1
    print(f"  {posted} journal entries posted\n")

    years = call(api, "/api/reports/years")
    pnl = call(api, f"/api/reports/pnl?year={args.year}")
    print(f"Done. Years in the journal: {years}")
    print("Open http://localhost:5173 - the P&L and the Balance Sheet now have figures.")
    print(f"(P&L for {args.year} returned {len(json.dumps(pnl))} bytes of statement data.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
