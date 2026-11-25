/**
 * Launches or reuses one Chrome instance with a dedicated profile and a local
 * debugging port, and exposes pages over CDP. The dedicated profile is what keeps
 * CARSI/Shibboleth publisher sessions across runs.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CDP } from './cdp.js'

const CANDIDATES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** Locate a Chromium-family executable. */
export function resolveChrome(explicit) {
  if (explicit) return explicit
  for (const name of CANDIDATES) {
    if (name.includes('/')) {
      if (existsSync(name)) return name
      continue
    }
    for (const dir of (process.env.PATH ?? '').split(':')) {
      const candidate = join(dir, name)
      if (dir && existsSync(candidate)) return candidate
    }
  }
  throw new Error('no Chrome/Chromium/Edge executable found; set executablePath in the plugin config')
}

/** Default profile directory, kept out of the user's normal browsing profile. */
export function defaultProfileDir() {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(base, 'papers-browser')
}

/** True when something already answers the debugging protocol on `port`. */
export async function isDebugPortAlive(port) {
  try {
    await CDP.version(`http://127.0.0.1:${port}`)
    return true
  } catch {
    return false
  }
}

/**
 * Start Chrome if the port is dead, then hand back a browser-level session.
 * @param {{port?: number, userDataDir?: string, executablePath?: string, headless?: boolean, startUrl?: string}} options
 */
export async function ensureChrome(options = {}) {
  const port = options.port ?? 9222
  const userDataDir = options.userDataDir ?? defaultProfileDir()
  if (await isDebugPortAlive(port)) {
    return { port, userDataDir, launched: false, process: null }
  }
  const executable = resolveChrome(options.executablePath)
  mkdirSync(userDataDir, { recursive: true })
  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--restore-last-session=false',
  ]
  if (options.headless) args.push('--headless=new')
  args.push(options.startUrl ?? 'about:blank')

  if (!options.headless && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('no graphical display for a visible browser; set DISPLAY or pass headless: true')
  }
  const child = spawn(executable, args, { detached: true, stdio: 'ignore' })
  child.unref()

  const deadline = Date.now() + 20_000
  let exited
  child.once('exit', code => { exited = code ?? -1 })
  while (Date.now() < deadline) {
    if (await isDebugPortAlive(port)) {
      return { port, userDataDir, launched: true, process: child }
    }
    if (exited !== undefined) {
      throw new Error(`Chrome exited with code ${exited} before opening the debugging port (profile ${userDataDir})`)
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Chrome did not expose a debugging port on ${port} within 20s (profile ${userDataDir})`)
}

/** One attached page (a flat CDP session on a target). */
export class Page {
  #cdp
  #sessionId
  #targetId

  constructor(cdp, targetId, sessionId) {
    this.#cdp = cdp
    this.#targetId = targetId
    this.#sessionId = sessionId
  }

  get targetId() {
    return this.#targetId
  }

  send(method, params) {
    return this.#cdp.send(method, params, this.#sessionId)
  }

  /**
   * Evaluate JavaScript in the page and return its JSON value.
   * Accepts an expression string or a function/arrow function source.
   */
  async evaluate(expression, { timeoutMs = 30_000, awaitPromise = true } = {}) {
    const source = typeof expression === 'function' ? `(${expression.toString()})()` : String(expression)
    const result = await this.send('Runtime.evaluate', {
      expression: source,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
      timeout: timeoutMs,
    })
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? 'evaluation failed'
      throw new Error(`page script failed: ${description}`)
    }
    return result.result?.value
  }

  /** Subscribe to protocol events for this page's own session. */
  onEvent(listener) {
    return this.#cdp.onEvent(message => {
      if (message.sessionId !== this.#sessionId) return
      listener(message)
    })
  }

  /** Run one of the self-contained page functions with a JSON argument. */
  call(pageFunction, argument, options) {
    if (typeof pageFunction !== 'function') throw new Error('page function expected')
    const source = argument === undefined
      ? `(${pageFunction.toString()})()`
      : `(${pageFunction.toString()})(${JSON.stringify(argument)})`
    return this.evaluate(source, options)
  }

  /** Navigate and wait for the main document load (or `domcontentloaded`). */
  async navigate(url, { timeoutMs = 45_000, settleMs = 400 } = {}) {
    const loaded = this.#cdp.waitForEvent('Page.loadEventFired', { sessionId: this.#sessionId, timeoutMs })
    const result = await this.send('Page.navigate', { url })
    if (result.errorText) throw new Error(`navigation failed: ${result.errorText}`)
    try {
      await loaded
    } catch {
      /* SPA route changes and aborted navigations may never fire loadEventFired */
    }
    if (settleMs) await new Promise(resolve => setTimeout(resolve, settleMs))
    return this
  }

  /** Poll an in-page predicate until it returns truthy. */
  async waitFor(check, { timeoutMs = 30_000, intervalMs = 400 } = {}) {
    const source = typeof check === 'function' ? `(${check.toString()})()` : String(check)
    const deadline = Date.now() + timeoutMs
    let last
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(source, { timeoutMs: 8000 })
        if (last) return last
      } catch (error) {
        last = error.message
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new Error(`condition not met within ${timeoutMs}ms (last: ${String(last).slice(0, 200)})`)
  }

  /**
   * Open a PDF link and return the URL the browser actually fetched the document
   * from. Publishers redirect to a signed asset URL whose body the PDF viewer owns,
   * so the signed URL — not the response body — is what a downloader needs.
   */
  async resolvePdfUrl(href, { timeoutMs = 45_000 } = {}) {
    await this.send('Network.enable')
    const urls = []
    const off = this.#cdp.onEvent(message => {
      if (message.sessionId !== this.#sessionId) return
      if (message.method !== 'Network.responseReceived') return
      const response = message.params.response
      const url = String(response.url || '')
      if (String(response.mimeType || '').includes('pdf') || /\.pdf(\?|$)/.test(url)) urls.push(url)
    })
    try {
      await this.send('Page.navigate', { url: href })
      const deadline = Date.now() + timeoutMs
      const publisherHost = (() => {
        try {
          return new URL(href).host
        } catch {
          return ''
        }
      })()
      // The publisher redirects to a signed asset host; that URL is the one worth
      // returning, while the publisher's own URL only works inside the viewer.
      const isAsset = url => {
        try {
          return new URL(url).host !== publisherHost
        } catch {
          return false
        }
      }
      while (Date.now() < deadline) {
        const asset = urls.find(isAsset)
        if (asset) return asset
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      if (urls.length) return urls.at(-1)
      throw new Error('no PDF response observed while opening the link')
    } finally {
      off()
    }
  }

  /**
   * Fetch `url` inside the page (so the publisher session and its cookies apply),
   * turn the bytes into a blob, and hand it to the browser's download path. This
   * avoids moving multi-megabyte payloads through the protocol and works even when
   * the PDF viewer owns the original request.
   */
  async saveUrlToFile(url, dir, filename, { timeoutMs = 90_000 } = {}) {
    mkdirSync(dir, { recursive: true })
    await this.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir })
    const before = new Set(readdirSync(dir))
    const result = await this.evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(url)}, { credentials: 'include' })
      if (!response.ok) return { status: response.status }
      const blob = await response.blob()
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(blob)
      anchor.download = ${JSON.stringify(filename)}
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(anchor.href), 120_000)
      return { status: response.status, size: blob.size }
    })()`)
    if (result?.status && result.status !== 200) throw new Error(`page fetch returned ${result.status}`)
    const deadline = Date.now() + timeoutMs
    let seen = null
    let stableSince = 0
    while (Date.now() < deadline) {
      const fresh = readdirSync(dir).filter(name => !before.has(name) && !name.endsWith('.crdownload'))
      if (fresh.length) {
        const name = fresh[0]
        const size = statSync(`${dir}/${name}`).size
        if (seen && seen.size === size && Date.now() - stableSince > 700) return `${dir}/${name}`
        if (!seen || seen.size !== size) {
          seen = { name, size }
          stableSince = Date.now()
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    throw new Error(`no downloaded file appeared within ${timeoutMs}ms`)
  }

  url() {
    return this.evaluate('location.href')
  }

  title() {
    return this.evaluate('document.title')
  }

  /** Base64 PNG of the viewport, for visual checks. */
  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    return data
  }

  async close() {
    await this.#cdp.send('Target.closeTarget', { targetId: this.#targetId })
  }
}

/** A connected browser with page factories. */
export class Browser {
  constructor(cdp, { port }) {
    this.cdp = cdp
    this.port = port
  }

  static async connect(port) {
    const cdp = await CDP.connect(`http://127.0.0.1:${port}`)
    return new Browser(cdp, { port })
  }

  /** Open a new tab and attach to it. */
  async newPage(url = 'about:blank') {
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await this.cdp.send('Page.enable', {}, sessionId)
    const page = new Page(this.cdp, targetId, sessionId)
    if (url && url !== 'about:blank') await page.navigate(url)
    return page
  }

  /** List page targets as `{ id, url, title }`. */
  async listPages() {
    const { targetInfos } = await this.cdp.send('Target.getTargets')
    return targetInfos
      .filter(target => target.type === 'page')
      .map(target => ({ id: target.targetId, url: target.url, title: target.title }))
  }

  /** Attach to an already open tab by target id. */
  async attach(targetId) {
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await this.cdp.send('Page.enable', {}, sessionId)
    return new Page(this.cdp, targetId, sessionId)
  }

  dispose() {
    this.cdp.close()
  }
}
