/**
 * Registered projects.
 *
 * The journal points at a SKU, so the registry is what makes that pointer
 * mean something — a settlement can be tied back to the deposit it belongs to
 * because both name the same registered project.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  createClient as apiCreate,
  deleteClient as apiDelete,
  fetchClients,
  updateClient as apiUpdate,
  type Client,
  type ClientIn,
} from './api'

export type { Client, ClientIn } from './api'

interface State {
  clients: Client[]
  loading: boolean
  error: string | null
}

let state: State = { clients: [], loading: true, error: null }
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

export async function refreshClients(): Promise<void> {
  try {
    const { clients } = await fetchClients()
    set({ clients, loading: false, error: null })
  } catch (e) {
    set({ loading: false, error: (e as Error).message })
  }
}

export function useClients(): State {
  useEffect(() => {
    if (started) return
    started = true
    void refreshClients()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

export async function addClient(body: ClientIn) {
  const result = await apiCreate(body)
  await refreshClients()
  return result
}

export async function editClient(sku: string, body: Omit<ClientIn, 'sku'>) {
  const result = await apiUpdate(sku, body)
  await refreshClients()
  return result
}

export async function removeClient(sku: string) {
  const result = await apiDelete(sku)
  await refreshClients()
  return result
}
