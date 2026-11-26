/**
 * Self-checks for the literature plugin: is the browser there, can we write, are the
 * databases reachable, is Zotero answering. Pure-ish helpers so `papers_doctor` can
 * report a table instead of failing at the first problem.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDebugPortAlive, defaultProfileDir } from './browser.js'

/** Write and delete a probe file, to prove the directory is usable. */
function checkWritable(dir, label) {
  const probe = join(dir, `.carsi-write-test-${Date.now()}`)
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return { label, status: 'ok', detail: dir }
  } catch (error) {
    return { label, status: 'fail', detail: `${dir} — ${error.message}` }
  }
}

/** HEAD the publisher origin; bot blocks still prove reachability. */
async function checkReachability(adapter) {
  try {
    const response = await fetch(adapter.origin, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    const status = response.status
    return {
      label: `${adapter.label} reachable`,
      status: status < 500 ? 'ok' : 'warn',
      detail: `${adapter.origin} → HTTP ${status}`,
    }
  } catch (error) {
    return {
      label: `${adapter.label} reachable`,
      status: 'fail',
      detail: `${adapter.origin} → ${error.name === 'TimeoutError' ? 'timeout' : error.message}`,
    }
  }
}

/** Ask Zotero's local server who it is, and whether a key is stored. */
async function checkZotero(baseUrl, keyFile) {
  try {
    const response = await fetch(`${baseUrl}/api/`, { signal: AbortSignal.timeout(5000) })
    const serverId = response.headers.get('Zotero-Server-ID')
    if (!response.ok || !serverId) {
      return { label: 'Zotero local API', status: 'warn', detail: `${baseUrl} answered HTTP ${response.status}` }
    }
    const hasKey = existsSync(keyFile)
    return {
      label: 'Zotero local API',
      status: hasKey ? 'ok' : 'warn',
      detail: hasKey ? `${baseUrl} (server ${serverId.slice(0, 6)}…, key stored)` : `${baseUrl} reachable, but no API key stored`,
    }
  } catch (error) {
    return {
      label: 'Zotero local API',
      status: 'warn',
      detail: `${baseUrl} unreachable (${error.name === 'TimeoutError' ? 'timeout' : error.message})`,
    }
  }
}

/**
 * Run every check and return `{ checks, summary, ok }`.
 * @param {{port: number, profileDir?: string, downloadDir: string, adapters: Array<object>, zoteroBaseUrl?: string, keyFile: string}} options
 */
export async function runDoctor(options) {
  const {
    port,
    profileDir = defaultProfileDir(),
    downloadDir,
    adapters,
    zoteroBaseUrl = 'http://127.0.0.1:23119',
    keyFile,
  } = options

  const checks = []
  const browserAlive = await isDebugPortAlive(port)
  checks.push({
    label: 'research browser',
    status: browserAlive ? 'ok' : 'warn',
    detail: browserAlive ? `listening on 127.0.0.1:${port}` : `not running; it starts on the first papers_open/papers_search`,
  })
  checks.push({
    label: 'browser profile',
    status: existsSync(profileDir) ? 'ok' : 'warn',
    detail: existsSync(profileDir) ? profileDir : `${profileDir} does not exist yet`,
  })
  checks.push(checkWritable(downloadDir, 'download directory'))
  checks.push({
    label: 'node version',
    status: Number(process.versions.node.split('.')[0]) >= 22 ? 'ok' : 'fail',
    detail: process.versions.node,
  })
  checks.push(await checkZotero(zoteroBaseUrl, keyFile))
  for (const adapter of adapters) checks.push(await checkReachability(adapter))

  const failed = checks.filter(check => check.status === 'fail')
  return { checks, summary: summarizeChecks(checks), ok: failed.length === 0 }
}

/** Render the check list as the model-facing text. */
export function summarizeChecks(checks) {
  const failed = checks.filter(check => check.status === 'fail').length
  const warned = checks.filter(check => check.status === 'warn').length
  const symbol = status => (status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌')
  return [
    `doctor: ${checks.length - failed - warned} ok, ${warned} warning(s), ${failed} failure(s)`,
    ...checks.map(check => `${symbol(check.status)} ${check.label}: ${check.detail}`),
  ].join('\n')
}
