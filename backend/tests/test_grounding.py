"""Unit test for check_grounding: does it let real figures through and stop
invented ones? Runs offline, no model calls."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent

EVIDENCE = '{"account":"Cash/Bank","closing_balance":710000,"period":"2026 year to date"}'
REPORT   = '{"figures":[{"label":"Revenue","amount":2426840},{"label":"EBIT","amount":710789}]}'

CASES = [
    # (what we are testing, reply, tools used, user asked, tool evidence, should_refuse)
    ("real figure straight from a tool",
     "Cash/Bank is 710,000 year to date.", ["get_account_details"], "how much cash", EVIDENCE, False),
    ("two real figures from a report",
     "Revenue was 2,426,840 and EBIT was 710,789.", ["get_financial_report"], "how did we do", REPORT, False),
    ("one real figure beside one invented",
     "Cash is 710,000 and inventory is about 2,300,000.", ["get_account_details"], "how much cash", EVIDENCE, True),
    ("wholly invented, though a tool ran",
     "Your revenue was 9,999,000.", ["get_account_details"], "how much cash", EVIDENCE, True),
    ("invented with no tool at all",
     "Cash went up by Rp 300.000 last month.", [], "explain prepayments", "", True),
    ("the user's own number quoted back",
     "You paid 200,000 for paint, so COGS goes up.", [], "paid 200000 for paint", "", False),
    ("no figures at all",
     "Accrued revenue is work done but not yet billed.", ["chart_of_accounts"], "what is accrued revenue", "", False),
    ("a year is not a money figure",
     "Art 21 is the withholding account and 2026 is the current year.", [], "what is art 21", "", False),
    ("a ratio is not a money figure",
     "Your current ratio is 1.54, which is healthy.", ["calculate_financial_ratio"], "current ratio", '{"value":1.54}', False),
    ("rounded restatement of a real figure",
     "Revenue was roughly 2,400,000 this year.", ["get_financial_report"], "revenue", REPORT, True),
]

print(f"{'result':<9} {'expected':<9} what was tested")
print("-" * 78)
passed = failed = 0
for label, reply, tools, asked, evidence, should_refuse in CASES:
    out = agent.check_grounding(reply, tools, asked, evidence)
    refused = out is not None
    ok = refused == should_refuse
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
    print(f"{'REFUSED' if refused else 'allowed':<9} "
          f"{'refuse' if should_refuse else 'allow':<9} {label}{'' if ok else '   <-- MISMATCH'}")

print("-" * 78)
print(f"{passed} as expected, {failed} not")
