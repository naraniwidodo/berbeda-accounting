"""Does the 400-token output cap cut answers off? Pushes the model towards
long answers on purpose."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent

CAP = 400
QUESTIONS = [
    "Explain every account in the chart of accounts and what each one is for.",
    "Walk me through all the sales templates step by step, with the debits and credits.",
    "Explain the difference between accrual and cash accounting, with an example from a painting job.",
    "Give me the full P&L for this year, line by line, and explain every line.",
    "What is a current ratio, a quick ratio and debt to equity, and what does each tell me?",
]

async def main():
    a = agent.build_agent()
    limits = agent.usage_limits()
    print(f"output cap: max_tokens={CAP}\n")
    print(f"{'out':>5} {'% of cap':>9} {'ends':>10}  question")
    print("-" * 96)
    worst = 0
    for q in QUESTIONS:
        r = await a.run(q, usage_limits=limits)
        out = r.usage.output_tokens
        text = (r.response.text or "").strip()
        ends = "sentence" if text.endswith((".", "!", "?", "”", '"', "*")) else "MID-WORD"
        worst = max(worst, out)
        print(f"{out:>5} {out / CAP * 100:>8.0f}% {ends:>10}  {q[:58]}")
    print("-" * 96)
    print(f"highest output seen: {worst} of {CAP} ({worst / CAP * 100:.0f}% of the cap)")

asyncio.run(main())
