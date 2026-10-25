"""How many hops does a real question actually need, and does the ceiling of 8
stop any of them? Runs against the live model."""
import asyncio, sys
from pathlib import Path, textwrap
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent
from models import ChatMessage

QUESTIONS = [
    ("simple",  "What is accrued revenue?"),
    ("lookup",  "How much cash do we have?"),
    ("ratio",   "What was our net profit margin this year?"),
    ("compare", "Compare January and October for me."),
    ("multi",   "Compare January and October, work out the profit margin for each, "
                "and tell me which month was better and why."),
    ("heavy",   "Give me revenue, COGS, gross profit, OPEX and EBIT for this year, "
                "then the current ratio and the debt to equity ratio, and explain "
                "what each ratio means for the business."),
]

async def main():
    a = agent.build_agent()
    limits = agent.usage_limits()
    print(f"ceiling: request_limit={limits.request_limit}, tool_calls_limit={limits.tool_calls_limit}\n")
    print(f"{'kind':<9} {'hops':>5} {'tools':>6} {'tokens':>8}  outcome")
    print("-" * 92)
    for kind, q in QUESTIONS:
        try:
            r = await a.run(q, usage_limits=limits)
            u = r.usage
            text = (r.response.text or "").strip()
            cut = "TRUNCATED" if not text.rstrip().endswith((".", "!", "?", "”", '"')) else "complete"
            print(f"{kind:<9} {u.requests:>5} {u.tool_calls:>6} {u.input_tokens + u.output_tokens:>8}  {cut}")
            print(f"          {textwrap.shorten(text, 150)}")
        except Exception as e:
            print(f"{kind:<9} {'-':>5} {'-':>6} {'-':>8}  STOPPED: {str(e)[:70]}")
        print()

asyncio.run(main())
