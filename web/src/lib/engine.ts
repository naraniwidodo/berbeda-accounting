/**
 * Posting rules engine - TypeScript port of engine.py.
 *
 * Turns a template choice plus a few numbers into balanced journal lines.
 * Mirrors output/transaction_template.md; the templates themselves live in
 * src/data/templates.json so the logic stays data-driven.
 */

import accountsData from '../data/accounts.json'
import templatesData from '../data/templates.json'

export type Side = 'Dr' | 'Cr'
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

export interface Account {
  code: string
  type: AccountType
  normal: Side
  details: string[]
}

export interface TemplateInput {
  name: string
  label: string
  type: string
}

export interface TemplateLineSpec {
  side: Side
  account: string
  amount: string
  detail?: string
  auto?: boolean
  note?: string
}

export interface Template {
  id: string
  group: string
  label: string
  /** What the template actually does, shown under the dropdown. */
  description?: string
  /** Optional reference fields this template asks for. */
  extras?: ('invoice_no' | 'payment_source')[]
  /** Overrides for the source field, where "source of payment" reads wrong. */
  payment_source_label?: string
  payment_source_placeholder?: string
  seen?: number
  sku?: 'required' | 'optional'
  stage?: number
  opens?: string
  closes?: string
  manual?: boolean
  picker?: string
  flag_for_review?: boolean
  detail_from?: string
  detail_default?: string
  inputs?: TemplateInput[]
  context?: { name: string; label: string; source: string; readonly?: boolean }[]
  settlement?: string[]
  lines: TemplateLineSpec[]
}

export interface JournalLine {
  side: Side
  account: string
  detail: string | null
  amount: number
  auto: boolean
}

export const ACCOUNTS: Record<string, Account> = Object.fromEntries(
  (accountsData.accounts as Account[]).map((a) => [a.code, a]),
)

export const ACCOUNT_LIST = accountsData.accounts as Account[]

export const SETTLEMENT = accountsData.settlement as Record<
  string,
  { label: string; account: string }
>

export const TEMPLATES = templatesData.templates as Template[]

export const TEMPLATES_BY_ID: Record<string, Template> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
)

export class PostingError extends Error {}

/** Evaluate a simple '+'/'-' expression over the supplied values. */
function evalAmount(expr: string, values: Record<string, number>): number {
  let total = 0
  let sign = 1
  for (const raw of expr.split(/\s*([+-])\s*/)) {
    const token = raw.trim()
    if (token === '+') sign = 1
    else if (token === '-') sign = -1
    else if (token) {
      const v = values[token]
      if (v === undefined || Number.isNaN(v)) throw new PostingError(`missing value: ${token}`)
      total += sign * v
    }
  }
  return Math.round(total)
}

export interface RenderResult {
  lines: JournalLine[]
  warnings: string[]
}

/** Build journal lines for a template. Throws PostingError if it cannot. */
export function render(
  templateId: string,
  values: Record<string, number>,
  opts: { settlement?: string; detail?: string } = {},
): RenderResult {
  const tpl = TEMPLATES_BY_ID[templateId]
  if (!tpl) throw new PostingError(`unknown template: ${templateId}`)
  if (tpl.manual) throw new PostingError('F1 is a manual entry - supply lines directly')

  const required = [
    ...(tpl.inputs ?? []).map((i) => i.name),
    ...(tpl.context ?? []).map((c) => c.name),
  ]
  for (const name of required) {
    if (values[name] === undefined || Number.isNaN(values[name])) {
      throw new PostingError(`${templateId} needs ${name}`)
    }
  }

  if (tpl.settlement) {
    if (!opts.settlement) throw new PostingError(`${templateId} needs a settlement mode`)
    if (!tpl.settlement.includes(opts.settlement)) {
      throw new PostingError(`${opts.settlement} not allowed for ${templateId}`)
    }
  }

  const detail = opts.detail ?? tpl.detail_default ?? undefined
  const warnings: string[] = []
  const lines: JournalLine[] = []

  for (const spec of tpl.lines) {
    const account =
      spec.account === '@settlement' ? SETTLEMENT[opts.settlement!].account : spec.account

    let lineDetail: string | null = spec.detail ?? detail ?? null
    const allowed = ACCOUNTS[account]?.details ?? []
    if (allowed.length) {
      if (!lineDetail || !allowed.includes(lineDetail)) {
        lineDetail = allowed[0]
        warnings.push(`${account}: detail set to "${lineDetail}"`)
      }
    } else {
      lineDetail = null
    }

    lines.push({
      side: spec.side,
      account,
      detail: lineDetail,
      amount: evalAmount(spec.amount, values),
      auto: spec.auto ?? false,
    })
  }

  validate(lines)
  return { lines, warnings }
}

/** Throws unless the lines form a legal double-entry record. */
export function validate(lines: JournalLine[]): true {
  if (!lines.length) throw new PostingError('entry has no lines')

  for (const ln of lines) {
    if (!ACCOUNTS[ln.account]) throw new PostingError(`unknown account: ${ln.account}`)
    if (ln.side !== 'Dr' && ln.side !== 'Cr') throw new PostingError(`bad side: ${ln.side}`)
    if (!(ln.amount > 0)) {
      throw new PostingError(`${ln.account}: amount must be positive`)
    }
    const allowed = ACCOUNTS[ln.account].details
    if (allowed.length && (!ln.detail || !allowed.includes(ln.detail))) {
      throw new PostingError(`${ln.account}: invalid detail "${ln.detail}"`)
    }
  }

  const dr = sumSide(lines, 'Dr')
  const cr = sumSide(lines, 'Cr')
  if (dr !== cr) throw new PostingError(`out of balance: Dr ${dr} vs Cr ${cr}`)
  return true
}

export function sumSide(lines: JournalLine[], side: Side): number {
  return lines.reduce((t, l) => (l.side === side ? t + l.amount : t), 0)
}

/** Detail options a template offers, taken from its anchor account. */
export function detailOptions(tpl: Template): string[] {
  if (!tpl.detail_from) return []
  return ACCOUNTS[tpl.detail_from]?.details ?? []
}

export const GROUP_ORDER = [
  'Sales',
  'Purchases',
  'Settlements',
  'Tax',
  'Other income',
  'Other',
] as const

/** Templates grouped for the dropdown, in catalog order. */
export function groupedTemplates(): { group: string; items: Template[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: TEMPLATES.filter((t) => t.group === group),
  })).filter((g) => g.items.length > 0)
}
