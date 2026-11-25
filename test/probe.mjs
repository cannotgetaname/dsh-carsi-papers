/**
 * Probe one publisher in the dedicated research profile: report title, final URL,
 * and whether the page offers an institutional (CARSI/Shibboleth) sign-in entry.
 *
 * Run with: node test/probe.mjs https://ieeexplore.ieee.org/
 */
import { Browser, ensureChrome, defaultProfileDir } from '../lib/browser.js'

const url = process.argv[2] || 'https://ieeexplore.ieee.org/'
const port = 9222

const { launched } = await ensureChrome({
  port,
  userDataDir: defaultProfileDir(),
  headless: false,
})
console.log(`chrome ${launched ? 'started' : 'reused'} (port ${port}, profile ${defaultProfileDir()})`)

const browser = await Browser.connect(port)
const pages = await browser.listPages()
const existing = pages.find(page => page.url.startsWith(url.split('/')[0] + '//' + new URL(url).hostname))
const page = existing ? await browser.attach(existing.id) : await browser.newPage('about:blank')

await page.navigate(url, { settleMs: 2500 })

const probe = await page.evaluate(`(() => {
  const text = (document.body?.innerText || '').slice(0, 6000)
  const lower = text.toLowerCase()
  const links = [...document.querySelectorAll('a')]
    .map(a => ({ text: (a.textContent || '').trim().slice(0, 60), href: a.href }))
    .filter(l => /institution|shibboleth|carsi|sso|sign in|log in/i.test(l.text + ' ' + l.href))
    .slice(0, 12)
  return {
    title: document.title,
    url: location.href,
    hasInstitutional: /institutional sign in|institutional login|access through your institution/i.test(lower),
    hasSignIn: /sign in|log in/i.test(lower),
    links,
    textStart: text.replace(/\\s+/g, ' ').slice(0, 500),
  }
})()`)

console.log(JSON.stringify(probe, null, 2))
browser.dispose()
