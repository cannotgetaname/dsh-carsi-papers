/**
 * Tiny assertion helper and browser plumbing shared by the test files.
 * No test framework: the plugin ships without dependencies, and its tests do too.
 */

import { Browser, ensureChrome } from '../lib/browser.js'

/** Minimal tester: records failures, prints one line per check it runs. */
export function createTester(label = 'tests') {
  const failures = []
  let passed = 0
  let current = ''

  const record = (name, ok, detail) => {
    if (ok) {
      passed += 1
      console.log(`  ok   ${name}`)
    } else {
      failures.push({ name, detail })
      console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
    }
  }

  return {
    get label() {
      return label
    },
    section(name) {
      current = name
      console.log(`\n# ${name}`)
    },
    equal(name, actual, expected) {
      const ok = Object.is(actual, expected)
      record(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    },
    deepEqual(name, actual, expected) {
      const a = JSON.stringify(actual)
      const b = JSON.stringify(expected)
      record(name, a === b, a === b ? '' : `expected ${b}, got ${a}`)
    },
    ok(name, condition, detail = '') {
      record(name, Boolean(condition), condition ? '' : detail || 'condition was falsy')
    },
    async throws(name, fn) {
      try {
        await fn()
        record(name, false, 'expected an error, none thrown')
      } catch {
        record(name, true)
      }
    },
    summary() {
      const total = passed + failures.length
      console.log(`\n${label}: ${passed}/${total} passed${failures.length ? `, ${failures.length} failed` : ''}`)
      for (const failure of failures) console.log(`  - ${failure.name}: ${failure.detail}`)
      return failures.length === 0
    },
    get current() {
      return current
    },
  }
}

/**
 * Ensure one headless Chrome for the whole run and hand a connected Browser to
 * `run`. Reuses a Chrome already listening on the port.
 */
export async function withHeadlessBrowser(run, { port = 9333, userDataDir = '/tmp/carsi-test-browser' } = {}) {
  await ensureChrome({ port, userDataDir, headless: true, startUrl: 'about:blank' })
  const browser = await Browser.connect(port)
  try {
    return await run(browser)
  } finally {
    browser.dispose()
  }
}

/** Open a fixture as a local page (no network). */
export async function openHtml(browser, html) {
  const page = await browser.newPage('about:blank')
  const encoded = Buffer.from(html, 'utf8').toString('base64')
  await page.navigate(`data:text/html;base64,${encoded}`)
  return page
}
