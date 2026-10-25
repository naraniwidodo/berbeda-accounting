"""Can a long question hit the ceiling of 8 model calls, and does splitting it
in two get an answer? This reproduces the user's own finding."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "backend"))
import agent

LONG = ("Give me the revenue, COGS, gross profit, S&D, marketing, OPEX, EBITDA and EBIT "
        "for January and for October separately, then compare the two months line by line, "
        "then calculate the net profit margin, gross profit margin, current ratio, quick ratio "
        "and debt to equity for each month, then tell me which month was better overall and "
        "explain why, and finally explain what each of those five ratios means for a small "
        "painting business.")

PART_1 = ("Give me the revenue, COGS, gross profit, OPEX and EBIT for January and October, "
          "and compare the two months.")
PART_2 = ("Calculate the net profit margin and the current ratio for January and October, "
          "and tell me which month was better and why.")

async def run(label, q):
    a = agent.build_agent()
    try:
        r = await a.run(q, usage_limits=agent.usage_limits())
        u = r.usage
        text = (r.response.text or "").strip()
        print(f"{label:<22} OK      calls={u.requests}  tools={u.tool_calls}  out={u.output_tokens}")
        print(f"{'':<22} {text[:140]}")
    except Exception as e:
        print(f"{label:<22} STOPPED {type(e).__name__}: {str(e)[:110]}")
    print()

async def main():
    print(f"ceiling: request_limit={agent.usage_limits().request_limit}\n")
    await run("one long question", LONG)
    await run("split, part 1", PART_1)
    await run("split, part 2", PART_2)

asyncio.run(main())
