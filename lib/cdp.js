/**
 * Minimal Chrome DevTools Protocol client built on the global WebSocket (Node 22+).
 * No third-party dependencies, so the plugin installs without a build step.
 */

/** Error raised when Chrome answers a command with an error object. */
export class CDPError extends Error {
  constructor(method, payload) {
    super(`CDP ${method} failed: ${payload?.message ?? 'unknown error'}`)
    this.name = 'CDPError'
    this.method = method
    this.payload = payload
  }
}

/**
 * Handle `Target.attachToTarget` flatten sessions: a flat id namespace where every
 * message carries an optional `sessionId`.
 */
export class CDP {
  #ws
  #nextId = 1
  #pending = new Map()
  #listeners = new Set()
  #closed = false

  constructor(ws) {
    this.#ws = ws
    ws.addEventListener('message', event => this.#onMessage(event.data))
    ws.addEventListener('close', () => {
      this.#closed = true
      for (const { reject } of this.#pending.values()) reject(new Error('CDP connection closed'))
      this.#pending.clear()
    })
    ws.addEventListener('error', () => {
      /* surfaced by the close handler and pending rejections */
    })
  }

  /**
   * @param {string} endpoint - `http://host:port` or a `ws(s)://` URL.
   * @returns {Promise<CDP>}
   */
  static async connect(endpoint) {
    const url = endpoint.startsWith('ws')
      ? endpoint
      : `${(await CDP.version(endpoint)).webSocketDebuggerUrl}`
    if (!url) throw new Error(`no debugger websocket at ${endpoint}`)
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP connect timeout: ${url}`)), 10_000)
      ws.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`CDP connect failed: ${url}`)) }, { once: true })
    })
    return new CDP(ws)
  }

  /** Read `/json/version`, used both as a liveness probe and endpoint discovery. */
  static async version(endpoint) {
    const res = await fetch(new URL('/json/version', endpoint.replace(/\/$/, '') + '/'), {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`/json/version returned ${res.status}`)
    return res.json()
  }

  get closed() {
    return this.#closed
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId]
   * @returns {Promise<any>}
   */
  send(method, params = {}, sessionId) {
    if (this.#closed) return Promise.reject(new Error('CDP connection closed'))
    const id = this.#nextId++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method })
      try {
        this.#ws.send(JSON.stringify(message))
      } catch (error) {
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  /** Subscribe to raw protocol events (filter by `msg.method`). */
  onEvent(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Resolve on the first matching event, or reject after `timeoutMs`. */
  waitForEvent(method, { sessionId, timeoutMs = 15_000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error(`timeout waiting for ${method}`))
      }, timeoutMs)
      const off = this.onEvent(message => {
        if (message.method !== method) return
        if (sessionId && message.sessionId !== sessionId) return
        clearTimeout(timer)
        off()
        resolve(message.params)
      })
    })
  }

  #onMessage(raw) {
    let message
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    } catch {
      return
    }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if (message.error) pending.reject(new CDPError(pending.method, message.error))
      else pending.resolve(message.result)
      return
    }
    for (const listener of this.#listeners) {
      try {
        listener(message)
      } catch {
        /* a broken listener must not break the socket */
      }
    }
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    try {
      this.#ws.close()
    } catch {
      /* already gone */
    }
  }
}
