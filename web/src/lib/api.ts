/**
 * The accounting API.
 *
 * Every accounting rule - entries must balance, numbers are sequential,
 * nothing is deleted, a closed period refuses changes - is enforced on the
 * server. This module does not re-implement any of them; it calls and reports
 * what came back, including the refusals.
 */

import type { JournalLine, Side } from './engine'

const BASE = '/api'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('Cannot reach the accounting API. Is the backend running?', 0)
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = body.detail[0]?.msg ?? detail
    } catch {
      /* keep the status line */
    }
    throw new ApiError(detail, res.status)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const get = <T,>(path: string) => request<T>(path)
const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

/* ── clients ───────────────────────────────────────────────────────────── */

export interface Client {
  sku: string
  client_name: string
  project: string
  dp_date: string | null
  note: string | null
  created_at: string
  open_prepayment: number
  has_entries: boolean
}

export interface ClientIn {
  sku: string
  client_name: string
  project?: string
  dp_date?: string | null
  note?: string | null
}

export const fetchClients = () => get<{ clients: Client[] }>('/clients')
export const createClient = (body: ClientIn) => post<{ client: Client }>('/clients', body)

export const updateClient = (sku: string, body: Omit<ClientIn, 'sku'>) =>
  request<{ client: Client }>(`/clients/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteClient = (sku: string) =>
  request<{ removed: string }>(`/clients/${encodeURIComponent(sku)}`, { method: 'DELETE' })

/* ── journal ───────────────────────────────────────────────────────────── */

/** Wire shape, snake_case as the API sends it. */
interface WireEntry {
  id: string
  date: string
  transaction_no: string
  template_id: string
  template_label: string
  sku: string
  settlement: string | null
  detail: string | null
  note: string | null
  created_at: string
  voided_at: string | null
  void_reason: string | null
  invoice_no: string | null
  payment_source: string | null
  cancelled: boolean
  lines: { side: Side; account: string; detail: string | null; amount: number; auto: boolean }[]
}

export interface JournalEntry {
  id: string
  date: string
  transactionNo: string
  templateId: string
  templateLabel: string
  sku: string
  settlement?: string
  detail?: string
  note?: string
  invoiceNo?: string
  paymentSource?: string
  createdAt: string
  voidedAt?: string
  voidReason?: string
  cancelled: boolean
  lines: JournalLine[]
}

function toEntry(w: WireEntry): JournalEntry {
  return {
    id: w.id,
    date: w.date,
    transactionNo: w.transaction_no,
    templateId: w.template_id,
    templateLabel: w.template_label,
    sku: w.sku,
    settlement: w.settlement ?? undefined,
    detail: w.detail ?? undefined,
    note: w.note ?? undefined,
    invoiceNo: w.invoice_no ?? undefined,
    paymentSource: w.payment_source ?? undefined,
    createdAt: w.created_at,
    voidedAt: w.voided_at ?? undefined,
    voidReason: w.void_reason ?? undefined,
    cancelled: w.cancelled,
    lines: w.lines,
  }
}

export interface JournalSnapshot {
  entries: JournalEntry[]
  openPrepayment: Record<string, number>
  nextNumbers: Record<string, string>
}

export async function fetchJournal(): Promise<JournalSnapshot> {
  const d = await get<{
    entries: WireEntry[]
    openPrepayment: Record<string, number>
    nextNumbers: Record<string, string>
  }>('/entries')
  return { ...d, entries: d.entries.map(toEntry) }
}

export interface PostEntryBody {
  template_id: string
  date: string
  values: Record<string, number>
  settlement?: string | null
  detail?: string | null
  sku?: string
  note?: string | null
  invoice_no?: string | null
  payment_source?: string | null
  /** Manual templates only — every other template writes its own lines. */
  lines?: { side: Side; account: string; detail: string | null; amount: number }[]
}

export async function postEntry(
  body: PostEntryBody,
): Promise<{ entry: JournalEntry; warnings: string[] }> {
  const d = await post<{ entry: WireEntry; warnings: string[] }>('/entries', body)
  return { entry: toEntry(d.entry), warnings: d.warnings }
}

export async function cancelEntry(id: string, reason: string): Promise<JournalEntry> {
  const d = await post<{ entry: WireEntry }>(`/entries/${id}/cancel`, { reason })
  return toEntry(d.entry)
}

/* ── statements ────────────────────────────────────────────────────────── */

export type RowKind = 'section' | 'detail' | 'subtotal' | 'total' | 'spacer'

export interface StatementRow {
  kind: RowKind
  label: string
  values?: number[]
}

export interface PnL {
  rows: StatementRow[]
  netIncome: number[]
  year: number
  months: string[]
}

export interface BalanceSheet {
  rows: StatementRow[]
  assets: number[]
  liabilitiesAndEquity: number[]
  balanced: boolean[]
  year: number
  months: string[]
}

export const fetchYears = () => get<{ years: number[] }>('/reports/years')
export const fetchPnl = (year: number) => get<PnL>(`/reports/pnl?year=${year}`)
export const fetchBalanceSheet = (year: number) =>
  get<BalanceSheet>(`/reports/balance-sheet?year=${year}`)

/* ── period lock ───────────────────────────────────────────────────────── */

export interface LockEvent {
  at: string
  action: 'lock' | 'unlock' | 'set-password'
  period: string | null
  note: string | null
}

export interface LockState {
  lockedThrough: string | null
  hasPassword: boolean
  log: LockEvent[]
}

export const fetchLock = () => get<LockState>('/lock')
export const setLockPassword = (password: string) =>
  post<LockState>('/lock/password', { password })
export const lockPeriod = (period: string, note?: string) =>
  post<LockState>('/lock', { period, note: note ?? null })
export const unlockPeriod = (password: string, note?: string) =>
  post<LockState>('/lock/unlock', { password, note: note ?? null })

/* ── accounting helper ─────────────────────────────────────────────────── */

export interface ChatUsage {
  question_tokens: number
  session_tokens: number
  session_calls: number
  cached_tokens: number
  limit_per_question: number | null
}

export interface ChatReply {
  reply: string
  model: string | null
  grounded_in: string[]
  configured: boolean
  usage: ChatUsage | null
}

export const sendChat = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
  post<ChatReply>('/chat', { messages })

export const fetchHealth = () =>
  get<{ ok: boolean; model: string; aiConfigured: boolean }>('/health')
