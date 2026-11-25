/**
 * dsh-carsi-papers — drive your own browser through the campus CARSI sign-in to
 * search subscribed literature databases and fetch their full texts.
 *
 * Registers `papers_*` tools on `ctx.tools`; the browser layer is a dependency-free
 * CDP client over a dedicated Chrome profile (see lib/browser.js).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  Browser,
  defaultProfileDir,
  ensureChrome,
  isDebugPortAlive,
} from './lib/browser.js'
import { mergeRecords, recordKey, toBibtex, toRis } from './lib/export.js'
import { zoteroWrite } from './lib/zotero.js'
import { buildFileName, sanitizeName } from './lib/naming.js'
import { requestHuman } from './lib/notify.js'
import {
  ADAPTERS,
  clickByLabel,
  countPages,
  findInstitutionalEntry,
  inspectPdf,
  pageExcerpt,
  readAccess,
  readMetadata,
  resolveAdapter,
} from './lib/papers.js'

export const name = 'dsh-carsi-papers'
export const inject = ['tools']

/** In-process browser handle, shared by every tool call in this host. */
const runtime = {
  /** @type {Browser | undefined} */
  browser: undefined,
  /** @type {import('./lib/browser.js').Page | undefined} */
  page: undefined,
  port: 9222,
  /** Timestamp of the last publisher request, used for pacing. */
  lastRequestAt: 0,
  /** Records seen by recent searches, keyed by id/doi/url, used to name downloads. */
  records: new Map(),
  /** Keys of records whose PDF actually landed on disk. */
  downloaded: new Set(),
}

/** Remember a search result under every identifier a later fetch may use. */
function indexRecord(record) {
  for (const key of [record.documentId, record.pii, record.doi, record.url]) {
    if (key) runtime.records.set(String(key), record)
  }
}

/** Find a previously seen record for this fetch request. */
function lookupRecord(args) {
  for (const key of [args.documentId, args.doi, args.url]) {
    if (!key) continue
    const hit = runtime.records.get(String(key))
    if (hit) return hit
  }
  return undefined
}

/** One browser operation at a time: tool calls queue instead of fighting over the tab. */
const queue = { tail: Promise.resolve() }

function serialize(task) {
  const run = queue.tail.then(task, task)
  queue.tail = run.then(() => undefined, () => undefined)
  return run
}

/** Retry work that failed for a transient reason (network, 5xx), never for a paywall. */
async function withRetry(fn, { attempts = 3, baseMs = 700 } = {}) {
  let last
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      last = error
      if (!error?.retryable || attempt === attempts - 1) throw error
      await new Promise(resolve => setTimeout(resolve, baseMs * 2 ** attempt))
    }
  }
  throw last
}

/** Downloads are counted per agent session, so a new session starts fresh. */
const downloadCounts = new WeakMap()
let sharedDownloads = 0

function downloadsOf(exec) {
  const agent = exec?.agent
  return agent ? (downloadCounts.get(agent) ?? 0) : sharedDownloads
}

function bumpDownloads(exec) {
  const agent = exec?.agent
  if (agent) downloadCounts.set(agent, downloadsOf(exec) + 1)
  else sharedDownloads += 1
}

/**
 * Wrap a tool body: serialize it against other browser work, optionally retry, and
 * turn a failure into a readable tool error instead of a stack trace.
 */
function guard(fn, { retries = 1 } = {}) {
  return (args, exec) => serialize(async () => {
    try {
      return await withRetry(() => fn(args, exec), { attempts: retries })
    } catch (error) {
      throw new Error(`[${error.name || 'Error'}] ${error.message}`)
    }
  })
}

/** Model-visible text for a tool result. */
const text = value => [{ type: 'text', text: value }]

function resolveSettings(config = {}) {
  return {
    port: Number(config.port) || 9222,
    profileDir: config.profileDir || defaultProfileDir(),
    executablePath: config.executablePath || undefined,
    downloadDir: config.downloadDir || join(process.cwd(), 'refs'),
    maxDownloads: Number(config.maxDownloads) || 30,
    requestGapMs: Number(config.requestGapMs) || 1500,
  }
}

/** Keep consecutive publisher requests at least `requestGapMs` apart. */
async function pace(settings) {
  const wait = runtime.lastRequestAt + settings.requestGapMs - Date.now()
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  runtime.lastRequestAt = Date.now()
}

/**
 * Detect a robot challenge and, when present, notify the desktop and fail the call
 * with an instruction the model can act on: the user has to clear it in the window.
 */
async function needsHuman(page, action, { timeoutMs = 90_000 } = {}) {
  let access = await readAccess(page)
  if (!access.challenge) return access
  const { notified, raised } = requestHuman(
    action,
    `${access.url}\n请在浏览器窗口完成人机验证，点击后我会自动继续。`,
  )
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    access = await readAccess(page)
    if (!access.challenge) return { ...access, waitedForHuman: true }
  }
  throw new Error(
    `still waiting for human verification at ${access.url} after ${Math.round(timeoutMs / 1000)}s `
    + `(notification ${notified ? 'shown' : 'unavailable'}, window ${raised ? 'raised' : 'not raised'}); `
    + 'ask the user to complete it in the browser window, then retry',
  )
}

/** Append one line of audit history next to the downloads directory. */
function audit(settings, entry) {
  try {
    mkdirSync(settings.downloadDir, { recursive: true })
    appendFileSync(
      join(settings.downloadDir, 'carsi-audit.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n',
    )
  } catch {
    /* auditing must never break a download */
  }
}

async function chromeAlive(port) {
  return isDebugPortAlive(port)
}

/**
 * Return the current page, opening a tab when there is none.
 * @param {{launch?: boolean}} options
 */
async function ensurePage(settings, { launch = true } = {}) {
  if (runtime.browser?.cdp.closed) runtime.browser = undefined
  if (!runtime.browser) {
    const alive = await chromeAlive(settings.port)
    if (!alive && !launch) return { browser: undefined, page: undefined, launched: false }
    const started = alive
      ? { launched: false }
      : await ensureChrome({
        port: settings.port,
        userDataDir: settings.profileDir,
        executablePath: settings.executablePath,
        headless: !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
      })
    runtime.browser = await Browser.connect(settings.port)
    runtime.port = settings.port
    return { browser: runtime.browser, page: undefined, launched: Boolean(started.launched) }
  }
  return { browser: runtime.browser, page: runtime.page, launched: false }
}

async function activePage(settings, { launch = true } = {}) {
  const resolved = await ensurePage(settings, { launch })
  if (!resolved.browser) return undefined
  if (runtime.page) {
    const pages = await resolved.browser.listPages()
    if (pages.some(page => page.id === runtime.page.targetId)) return runtime.page
    runtime.page = undefined
  }
  runtime.page = await resolved.browser.newPage('about:blank')
  return runtime.page
}

export function apply(ctx, config = {}) {
  const settings = resolveSettings(config)

  ctx.tools.register({
    name: 'papers_status',
    description:
      'Report the literature browser state without starting it: whether Chrome with the '
      + 'dedicated research profile is running, its debugging port and profile directory, and the '
      + 'open tabs. Use it before asking the user to sign in.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async () => {
      const alive = await chromeAlive(settings.port)
      const lines = [
        `browser: ${alive ? 'running' : 'not running'}`,
        `port: ${settings.port}`,
        `profile: ${settings.profileDir}`,
        `display: ${process.env.DISPLAY || process.env.WAYLAND_DISPLAY || 'none (headless)'}`,
      ]
      let tabs = []
      if (alive) {
        const browser = await Browser.connect(settings.port)
        try {
          tabs = await browser.listPages()
        } finally {
          browser.dispose()
        }
        lines.push(`tabs: ${tabs.length}`)
        for (const tab of tabs.slice(0, 10)) lines.push(`  - ${tab.title || '(untitled)'} — ${tab.url}`)
      }
      return { running: alive, port: settings.port, tabs, summary: lines.join('\n') }
    }),
  })

  ctx.tools.register({
    name: 'papers_open',
    description:
      'Open a URL in the literature browser (starting Chrome with the dedicated research profile when '
      + 'needed) and return the page title, final URL, and whether the page looks like a sign-in or '
      + 'paywall page. Use it to reach a database or to hand the window to the user for CARSI sign-in.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL to open.' },
        newTab: { type: 'boolean', description: 'Open in a fresh tab instead of the current one.' },
        waitMs: {
          type: 'integer',
          minimum: 0,
          maximum: 20000,
          description: 'Extra settle time after load for client-rendered pages; default 800.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const launched = await ensurePage(settings, { launch: true })
      if (args.newTab || !runtime.page) {
        runtime.page = await launched.browser.newPage('about:blank')
      }
      await runtime.page.navigate(args.url, { settleMs: args.waitMs ?? 800 })
      const title = await runtime.page.title().catch(() => '')
      const url = await runtime.page.url().catch(() => args.url)
      const probe = await readAccess(runtime.page).catch(() => ({}))
      const flags = [
        probe.paywalled ? 'paywall markers' : '',
        probe.challenge ? 'robot challenge' : '',
      ].filter(Boolean)
      const human = probe.challenge
        ? requestHuman('打开页面后遇到人机验证', `${url}\n请在浏览器窗口完成验证，完成后叫我继续。`)
        : null
      const excerpt = await runtime.page.call(pageExcerpt, 300).catch(() => '')
      return {
        url,
        title,
        launched: Boolean(launched.launched),
        page: { institution: probe.institution ?? null, fullText: Boolean(probe.fullText), paywall: Boolean(probe.paywalled) },
        summary: [
          `opened: ${url}`,
          `title: ${title || '(untitled)'}`,
          `browser: ${launched.launched ? 'started' : 'reused'}`,
          `flags: ${flags.length ? flags.join(', ') : 'none'}`,
          human ? `human verification: notification ${human.notified ? 'shown' : 'unavailable'}, window ${human.raised ? 'raised' : 'not raised'}` : '',
          excerpt ? `page text: ${excerpt}` : '',
        ].filter(Boolean).join('\n'),
      }
    }),
  })

  ctx.tools.register({
    name: 'papers_search',
    description:
      'Search one or several subscribed databases through the research browser and return normalized '
      + 'records with each item\'s access state. With several publishers the records are merged by DOI '
      + '(or title) and each entry lists every database that returned it.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, in the database\'s own language.' },
        publisher: {
          type: 'string',
          enum: ADAPTERS.map(adapter => adapter.name),
          description: 'One database; default ieee. Ignored when publishers is set.',
        },
        publishers: {
          type: 'array',
          items: { type: 'string', enum: ADAPTERS.map(adapter => adapter.name) },
          description: 'Search these databases and merge the results.',
        },
        rows: { type: 'integer', minimum: 1, maximum: 50, description: 'Records per database; default 10.' },
        yearFrom: { type: 'integer', description: 'Earliest publication year.' },
        yearTo: { type: 'integer', description: 'Latest publication year.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const names = args.publishers?.length ? args.publishers : [args.publisher ?? 'ieee']
      const page = await activePage(settings)
      const batches = []
      for (const name of names) {
        const adapter = resolveAdapter(name)
        if (!adapter) throw new Error(`unknown publisher "${name}"`)
        const current = await page.url().catch(() => '')
        if (!adapter.match(current)) await page.navigate(adapter.origin, { settleMs: 600 })
        await needsHuman(page, `${adapter.label} 检索`)
        await pace(settings)
        const result = await adapter.search(page, args.query, {
          rows: args.rows,
          yearFrom: args.yearFrom,
          yearTo: args.yearTo,
        })
        for (const record of result.records) indexRecord(record)
        audit(settings, {
          action: 'search',
          publisher: adapter.name,
          query: args.query,
          hits: result.total,
          returned: result.records.length,
        })
        batches.push({ publisher: adapter.name, records: result.records })
      }
      const records = mergeRecords(batches)
      const lines = [`${names.join(' + ')}: ${records.length} merged hits for "${args.query}"`]
      for (const [index, record] of records.entries()) {
        const access = record.access === 'subscribed' || record.access === 'available'
          ? 'subscribed'
          : record.access ?? 'unknown'
        lines.push(`${index + 1}. [${access}] ${record.title}`)
        lines.push(`   ${[record.venue, record.year, record.doi, record.sources.join('/')].filter(Boolean).join(' · ')}`)
      }
      return { publishers: names, records, summary: lines.join('\n') }
    }),
  })

  ctx.tools.register({
    name: 'papers_fetch',
    description:
      'Download one article\'s full-text PDF through the research browser, verify that the bytes really '
      + 'are a PDF, save it under the downloads directory, and report the path, page count, and size. '
      + 'A paywall or challenge is reported instead of bypassed.',
    parameters: {
      type: 'object',
      properties: {
        publisher: {
          type: 'string',
          enum: ADAPTERS.map(adapter => adapter.name),
          description: 'Database adapter; inferred from url or doi when omitted.',
        },
        documentId: { type: 'string', description: 'Adapter-specific record id (IEEE article number).' },
        url: { type: 'string', description: 'Article page URL, for adapters that download from it.' },
        doi: { type: 'string', description: 'DOI; resolves to the publisher page before downloading.' },
        outDir: { type: 'string', description: 'Directory for the saved PDF; defaults to the configured downloads directory.' },
        filename: { type: 'string', description: 'File name without extension; derived from the article when omitted.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async (args, exec) => {
      const page = await activePage(settings)
      let adapter = args.publisher ? resolveAdapter(args.publisher) : undefined
      if (!adapter && args.url) adapter = resolveAdapter(args.url)
      if (!adapter && args.doi) {
        await page.navigate(`https://doi.org/${args.doi}`, { settleMs: 1200 })
        adapter = resolveAdapter(await page.url().catch(() => ''))
      }
      if (!adapter) throw new Error('cannot tell which database this article belongs to; pass publisher')
      if (downloadsOf(exec) >= settings.maxDownloads) {
        throw new Error(`download cap reached (${settings.maxDownloads} per session); start a new session to continue`)
      }
      // A page-context fetch only reaches the publisher on its own origin, so return
      // the tab to that publisher before any adapter download.
      const currentUrl = await page.url().catch(() => '')
      if (!adapter.match(currentUrl)) await page.navigate(adapter.origin, { settleMs: 800 })
      await pace(settings)
      const record = { documentId: args.documentId, url: args.url, doi: args.doi }
      const known = lookupRecord(args)
      let meta = known
        ? { title: known.title, year: known.year, authors: known.authors ?? [] }
        : {}
      if (!args.filename && !meta.title) {
        const articleUrl = adapter.articleUrl?.(record)
        if (articleUrl) await page.navigate(articleUrl, { settleMs: 1500 })
        meta = await (adapter.metadata ? adapter.metadata(page) : readMetadata(page)).catch(() => ({}))
      }
      let buffer, contentType
      try {
        ({ buffer, contentType } = await adapter.pdf(page, record))
      } catch (error) {
        await needsHuman(page, `${adapter.label} 下载`).catch(() => {})
        throw error
      }
      const pdf = inspectPdf(buffer)
      if (!pdf.isPdf) {
        throw new Error(`downloaded bytes are not a PDF (content-type ${contentType ?? 'unknown'}, ${pdf.bytes} bytes)`)
      }
      const outDir = args.outDir || settings.downloadDir
      mkdirSync(outDir, { recursive: true })
      const name = sanitizeName(args.filename || buildFileName(meta) || `${adapter.name}-${args.documentId || Date.now()}`)
      const path = join(outDir, `${name}.pdf`)
      writeFileSync(path, buffer)
      const pages = countPages(path, buffer)
      runtime.downloaded.add(recordKey(known ?? { doi: meta.doi ?? args.doi, title: meta.title }))
      bumpDownloads(exec)
      audit(settings, {
        action: 'fetch',
        publisher: adapter.name,
        documentId: args.documentId ?? null,
        doi: args.doi ?? meta.doi ?? null,
        title: meta.title ?? null,
        path,
        bytes: pdf.bytes,
        pages,
      })
      return {
        path,
        bytes: pdf.bytes,
        pages,
        publisher: adapter.name,
        summary: [
          `saved: ${path}`,
          `size: ${(pdf.bytes / 1048576).toFixed(1)} MB · pages: ${pages} · verified PDF`,
          `downloads this session: ${downloadsOf(exec)}/${settings.maxDownloads}`,
        ].join('\n'),
      }
    }),
  })

  ctx.tools.register({
    name: 'papers_login',
    description:
      'Open a database\'s institutional sign-in entry in the research browser and hand the window to '
      + 'the user for the campus CARSI sign-in. Lists the sign-in controls it finds, clicks one when '
      + 'asked, and reports whether the subscription is already recognized. It never types credentials.',
    parameters: {
      type: 'object',
      properties: {
        publisher: {
          type: 'string',
          enum: ADAPTERS.map(adapter => adapter.name),
          description: 'Database adapter; inferred from url when omitted.',
        },
        url: { type: 'string', description: 'Publisher page to open instead of the adapter home page.' },
        click: { type: 'string', description: 'Exact label of an institutional sign-in control to click.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const adapter = args.publisher ? resolveAdapter(args.publisher) : resolveAdapter(args.url ?? '')
      const page = await activePage(settings)
      const target = args.url || adapter?.origin
      if (!target) throw new Error('pass publisher or url')
      await page.navigate(target, { settleMs: 1200 })
      let access = await readAccess(page)
      if (access.institution) {
        return {
          institution: access.institution,
          summary: `${adapter?.label ?? target}\naccess: already institutional — ${access.institution}`,
        }
      }
      let clicked
      if (args.click) {
        clicked = await clickByLabel(page, args.click)
        await new Promise(resolve => setTimeout(resolve, 2500))
        access = await readAccess(page)
        if (access.institution) {
          return {
            institution: access.institution,
            summary: `${adapter?.label ?? target}\naccess: institutional after clicking "${args.click}" — ${access.institution}`,
          }
        }
      }
      const entries = await findInstitutionalEntry(page)
      const lines = [
        `${adapter?.label ?? target}`,
        `access: ${access.paywalled ? 'not recognized (paywall markers)' : 'no institutional marker yet'}`,
        access.challenge ? 'challenge: the page is showing a robot check; complete it in the window' : '',
        entries.length ? 'sign-in controls:' : 'sign-in controls: none found',
        ...entries.map(entry => `  - ${entry.label}${entry.href ? ` (${entry.href})` : ''}`),
        clicked ? `clicked: ${args.click} (${clicked.clicked ? 'ok' : 'not found'})` : '',
        'next: complete the campus CARSI sign-in in the browser window, then call papers_access to confirm',
      ]
      return { institution: null, entries, clicked, summary: lines.filter(Boolean).join('\n') }
    }),
  })

  ctx.tools.register({
    name: 'papers_access',
    description:
      'Open a publisher page in the research browser and report whether the campus subscription is '
      + 'recognized there: the institution name the site reports, paywall markers, and whether a robot '
      + 'challenge is blocking the page. Use it to check one database before searching it.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) publisher URL.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const page = await activePage(settings)
      await page.navigate(args.url, { settleMs: 1500 })
      const access = await readAccess(page)
      const human = access.challenge
        ? requestHuman('页面需要人机验证', `${args.url}\n请在浏览器窗口完成验证，完成后叫我继续。`)
        : null
      const state = access.challenge
        ? 'blocked by a robot challenge'
        : access.institution
          ? `institution: ${access.institution}`
          : access.paywalled
            ? 'no institutional access (paywall)'
            : 'no institutional marker found'
      return {
        ...access,
        summary: [
          `${access.title || '(untitled)'}`,
          `${access.url}`,
          `access: ${state}`,
          human ? `human verification: notification ${human.notified ? 'shown' : 'unavailable'}, window ${human.raised ? 'raised' : 'not raised'}` : '',
        ].filter(Boolean).join('\n'),
      }
    }),
  })

  ctx.tools.register({
    name: 'papers_export',
    description:
      'Write the records this session has seen as a BibTeX or RIS file inside the downloads directory, '
      + 'ready to import into Zotero or another reference manager.',
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['bibtex', 'ris'], description: 'File format; default bibtex.' },
        scope: {
          type: 'string',
          enum: ['downloaded', 'session'],
          description: 'downloaded (default) exports only records whose PDF was saved; session exports everything seen.',
        },
        outFile: { type: 'string', description: 'File name inside the downloads directory.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const seen = [...new Set(runtime.records.values())]
      const scope = args.scope ?? 'downloaded'
      const records = scope === 'downloaded'
        ? seen.filter(record => runtime.downloaded.has(recordKey(record)))
        : seen
      if (!records.length) {
        throw new Error(scope === 'downloaded'
          ? 'no downloaded records yet; run papers_fetch first (or pass scope: session)'
          : 'no records seen yet; run papers_search first')
      }
      const format = args.format ?? 'bibtex'
      const content = format === 'ris' ? toRis(records) : toBibtex(records)
      const name = args.outFile || `carsi-records.${format === 'ris' ? 'ris' : 'bib'}`
      mkdirSync(settings.downloadDir, { recursive: true })
      const path = join(settings.downloadDir, name)
      writeFileSync(path, content)
      audit(settings, { action: 'export', format, records: records.length, path })
      return { path, count: records.length, summary: `exported ${records.length} records as ${format}: ${path}` }
    }),
  })

  ctx.tools.register({
    name: 'papers_zotero',
    description:
      'Write the records this session has seen straight into the local Zotero library through its '
      + 'local API. Requires a one-time authorization approved in the Zotero window; the key is read '
      + 'from ZOTERO_API_KEY or the plugin key file, never from the repository.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['downloaded', 'session'],
          description: 'downloaded (default) writes only records whose PDF was saved; session writes everything seen.',
        },
        library: { type: 'string', description: 'Zotero library path; default users/0.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const seen = [...new Set(runtime.records.values())]
      const scope = args.scope ?? 'downloaded'
      const records = scope === 'downloaded'
        ? seen.filter(record => runtime.downloaded.has(recordKey(record)))
        : seen
      if (!records.length) {
        throw new Error(scope === 'downloaded'
          ? 'no downloaded records yet; run papers_fetch first (or pass scope: session)'
          : 'no records seen yet; run papers_search first')
      }
      const keyFile = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'zotero-api-key')
      const apiKey = process.env.ZOTERO_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
      if (!apiKey) throw new Error(`no Zotero API key; approve one in Zotero and save it to ${keyFile}`)
      const result = await zoteroWrite(records, { apiKey, library: args.library })
      audit(settings, { action: 'zotero', scope, requested: records.length, created: result.created })
      return {
        ...result,
        summary: [
          `Zotero: ${result.created} new item(s), ${result.unchanged} unchanged, ${result.failed} failed`,
          result.items.length ? `keys: ${result.items.slice(0, 8).join(', ')}${result.items.length > 8 ? ' …' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }
    }),
  })

  ctx.tools.register({
    name: 'papers_eval',
    description:
      'Run JavaScript in the active literature-browser page and return its JSON value. This is the '
      + 'escape hatch for a database whose layout the plugin does not adapt yet: read the DOM, call the '
      + "site's own JSON endpoints with fetch, or extract fields. Keep the value small.",
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression or async IIFE source evaluated in the page.',
        },
        url: {
          type: 'string',
          description: 'Navigate here first when the active tab is on another origin.',
        },
        maxChars: {
          type: 'integer',
          minimum: 200,
          maximum: 60000,
          description: 'Character cap for the returned JSON; default 8000.',
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const page = await activePage(settings)
      if (args.url) await page.navigate(args.url, { settleMs: 800 })
      const value = await page.evaluate(args.expression)
      const json = JSON.stringify(value ?? null)
      const cap = args.maxChars ?? 8000
      const clipped = json.length > cap
      return {
        value,
        summary: clipped
          ? `${json.slice(0, cap)}\n… (${json.length - cap} characters clipped)`
          : json,
      }
    }),
  })

  // Release the CDP socket when the plugin unloads; the browser itself keeps running.
  ctx.effect(() => () => {
    runtime.browser?.dispose()
    runtime.browser = undefined
    runtime.page = undefined
  }, 'carsiPapers.cleanup')
}
