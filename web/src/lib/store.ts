/**
 * Journal state, backed by the API.
 *
 * The rules used to live here when entries sat in localStorage; they now live
 * on the server, so this module only fetches, caches and re-fetches. Anything
 * it reports - the next number, what is still open, whether an entry was
 * refused - came from the backend.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  cancelEntry as apiCancel,
  fetchJournal,
  postEntry as apiPost,
  type JournalEntry,
  type JournalSnapshot,
  type PostEntryBody,
} from './api'

export type { JournalEntry } from './api'

const EMPTY: JournalSnapshot = { entries: [], openPrepayment: {}, nextNumbers: {} }

interface State {
  data: JournalSnapshot
  loading: boolean
  error: string | null
}

let state: State = { data: EMPTY, loading: true, error: null }
let started = false
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function refreshJournal(): Promise<void> {
  try {
    set({ data: await fetchJournal(), loading: false, error: null })
  } catch (e) {
    set({ loading: false, error: (e as Error).message })
  }
}

/** Entries, plus whether we are still waiting and whether the API answered. */
export function useJournal(): State {
  useEffect(() => {
    if (started) return
    started = true
    void refreshJournal()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

export async function addEntry(body: PostEntryBody) {
  const result = await apiPost(body)
  await refreshJournal()
  return result
}

export async function cancelEntry(id: string, reason: string) {
  const entry = await apiCancel(id, reason)
  await refreshJournal()
  return entry
}

/* ── derived, from what the server returned ────────────────────────────── */

export function liveEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((e) => !e.cancelled)
}

export function sortedEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
  )
}

/** Every SKU seen so far, newest first. */
export function knownSkus(entries: JournalEntry[]): string[] {
  const seen: string[] = []
  for (const e of [...entries].reverse()) {
    if (e.sku && !seen.includes(e.sku)) seen.push(e.sku)
  }
  return seen
}

/** Register prefix each template group posts under, matching the source book. */
export function prefixFor(templateId: string): string {
  if (templateId.startsWith('A')) return 'SPM'
  if (templateId.startsWith('B') || templateId.startsWith('C')) return 'NSPB'
  if (templateId.startsWith('D')) return 'ART'
  if (templateId.startsWith('E')) return 'NSPM'
  return 'GEN'
}
