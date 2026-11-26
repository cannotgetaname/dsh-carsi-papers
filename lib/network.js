/**
 * Network facts and campus-prefix bookkeeping. No browser, no dependencies.
 */

import { networkInterfaces } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** IPv4 /16 prefix, or IPv6 /32, used as a coarse "is this the campus network" key. */
export function prefixOf(ip) {
  const value = String(ip ?? '').trim()
  if (!value) return null
  if (value.includes(':')) return value.split(':').slice(0, 2).join(':')
  const parts = value.split('.')
  if (parts.length !== 4) return null
  return `${parts[0]}.${parts[1]}`
}

/** Local interface addresses, excluding loopback and docker bridges. */
export function localAddresses(interfaces = networkInterfaces()) {
  const result = []
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (/^(lo|docker|br-|veth)/.test(name)) continue
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      result.push({ interface: name, address: address.address, prefix: prefixOf(address.address) })
    }
  }
  return result
}

/** Public echo services; several because the campus NAT pool answers with different addresses. */
const ECHO_SERVICES = [
  'https://ifconfig.co/ip',
  'https://icanhazip.com',
  'https://ipinfo.io/ip',
  'https://api.ipify.org',
  'https://myip.ipip.net',
]

/** Pull an IPv4 out of a plain or decorated response. */
export function extractIp(body) {
  const match = String(body ?? '').match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
  return match ? match[1] : null
}

/** Ask several echo services for the egress address; NAT pools can rotate. */
export async function egressAddresses({ fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const found = new Set()
  await Promise.all(ECHO_SERVICES.map(async url => {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) return
      const ip = extractIp(await response.text())
      if (ip) found.add(ip)
    } catch {
      /* try the rest */
    }
  }))
  return [...found]
}

/** First address that answered, for callers that only need one. */
export async function egressAddress(options = {}) {
  const addresses = await egressAddresses(options)
  return addresses[0] ?? null
}

/** Default store path. */
export function storePath() {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(base, 'campus-guard.json')
}

/** Read learned campus prefixes. */
export function loadStore(path = storePath()) {
  try {
    if (!existsSync(path)) return { prefixes: [] }
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return { prefixes: Array.isArray(parsed.prefixes) ? parsed.prefixes : [] }
  } catch {
    return { prefixes: [] }
  }
}

/** Learn a prefix (idempotent). */
export function rememberPrefix(prefix, path = storePath()) {
  if (!prefix) return { prefixes: [] }
  const store = loadStore(path)
  if (!store.prefixes.includes(prefix)) store.prefixes.push(prefix)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2))
  return store
}

/** Verdict for one address against the learned prefixes. */
export function judge(address, prefixes = []) {
  if (!address) return 'unknown'
  const prefix = prefixOf(address)
  if (!prefixes.length) return 'unknown'
  return prefixes.includes(prefix) ? 'campus' : 'off-campus'
}

/** Judge a set of observed addresses: campus when any prefix is known. */
export function judgePool(addresses = [], prefixes = []) {
  if (!addresses.length) return 'unknown'
  if (!prefixes.length) return 'unknown'
  return addresses.some(address => prefixes.includes(prefixOf(address))) ? 'campus' : 'off-campus'
}
