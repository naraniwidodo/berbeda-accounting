# Agent Instructions — Berbeda accounting (Big Project)

These rules are scoped to this project and take precedence over the
`AGENTS.md` one level up for anything they cover.

## Model

- **Always `gpt-6-luna`. Never substitute another model**, including
  `gpt-5.6-luna`, which the parent `AGENTS.md` names as the default. The user
  pinned this for this project explicitly.
- Verified against the gateway on 22 Oct 2026: `gpt-6-luna` resolves to
  `gpt-6-luna-2026-09-22`.

> ⚠️ **The Portkey gateway does not reject unknown model names.** Sending a
> model string it does not recognise returns HTTP 200 and silently answers
> with `gpt-5.6-luna`. A typo will therefore not fail — it will quietly serve
> the wrong model.
>
> So every call must **read `response.model` back and check it starts with
> `gpt-6-luna`**, and fail loudly if it does not. Setting the request string
> is not sufficient evidence that the right model answered.

- Do not change `PORTKEY_MODEL` in the shared `../.env` — that file is used by
  the other coursework in this folder. This project reads its model from its
  own config and falls back to `gpt-6-luna`, never to the shared value.

## Conventions carried over from the parent AGENTS.md

- OpenAI-compatible calls through Portkey; key from the root `.env` as
  `PORTKEY_API_KEY`.
- Never hard-code API keys or commit secrets.
