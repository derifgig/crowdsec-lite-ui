export interface Alert {
  id: number
  scenario: string
  message: string
  start_at: string
  stop_at: string
  simulated: boolean
  events_count: number
  source: {
    scope: string
    value: string
    ip: string
    range: string
    as_number: string
    as_name: string
    cn: string
    latitude: number
    longitude: number
  }
  decisions: Decision[] | null
  meta: Array<{ key: string; value: string }> | null
}

export interface Decision {
  id: number
  origin: string
  type: string
  scope: string
  value: string
  duration: string
  scenario: string
  simulated: boolean
}

export interface PaginatedAlerts {
  alerts: Alert[]
  total: number
  page: number
  page_size: number
}

export interface PaginatedDecisions {
  decisions: Decision[]
  total: number
  page: number
  page_size: number
}

export interface HealthStatus {
  ok: boolean
  lapi_connected: boolean
  error?: string
}

export interface BanRequest {
  ip: string
  duration: string
  reason: string
  type: 'ban' | 'captcha'
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/api/health')
}

export function getAlerts(params: {
  since?: string
  ip?: string
  scenario?: string
  page?: number
  page_size?: number
}): Promise<PaginatedAlerts> {
  const qs = new URLSearchParams()
  if (params.since) qs.set('since', params.since)
  if (params.ip) qs.set('ip', params.ip)
  if (params.scenario) qs.set('scenario', params.scenario)
  if (params.page != null) qs.set('page', String(params.page))
  if (params.page_size != null) qs.set('page_size', String(params.page_size))
  const query = qs.toString()
  return apiFetch<PaginatedAlerts>(`/api/alerts${query ? `?${query}` : ''}`)
}

export function getAlertById(id: number): Promise<Alert> {
  return apiFetch<Alert>(`/api/alerts/${id}`)
}

export function getDecisions(params: {
  ip?: string
  page?: number
  page_size?: number
}): Promise<PaginatedDecisions> {
  const qs = new URLSearchParams()
  if (params.ip) qs.set('ip', params.ip)
  if (params.page != null) qs.set('page', String(params.page))
  if (params.page_size != null) qs.set('page_size', String(params.page_size))
  const query = qs.toString()
  return apiFetch<PaginatedDecisions>(`/api/decisions${query ? `?${query}` : ''}`)
}

export function addDecision(req: BanRequest): Promise<void> {
  return apiFetch<void>('/api/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function deleteDecision(id: number): Promise<void> {
  return apiFetch<void>(`/api/decisions/${id}`, { method: 'DELETE' })
}

export interface InfoResult {
  total_alerts: number
  active_decisions: number
  top_scenarios: Array<{ scenario: string; count: number }>
  top_countries: Array<{ country: string; count: number }>
  top_ips: Array<{ ip: string; count: number }>
  allowlists: Array<{
    name: string
    description: string
    created_at: string
    updated_at: string
    size: number
  }>
  ui_version: string
  ui_uptime: string
}

export async function getInfo(): Promise<InfoResult> {
  const res = await fetch('/api/info')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}
