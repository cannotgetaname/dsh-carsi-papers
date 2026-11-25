/**
 * Standalone kernel check: no DSH involved. Launches a throwaway Chrome profile,
 * verifies navigation, JS evaluation, and page listing over CDP.
 *
 * Run with: node test/kernel.mjs
 */
import { rmSync } from 'node:fs'
import { Browser, ensureChrome } from '../lib/browser.js'

const port = 9333
const userDataDir = '/tmp/carsi-papers-kernel-test'

const started = Date.now()
const { launched } = await ensureChrome({ port, userDataDir, headless: true, startUrl: 'about:blank' })
console.log(`chrome ready in ${Date.now() - started}ms (launched=${launched})`)

const browser = await Browser.connect(port)
try {
  const page = await browser.newPage('data:text/html,<title>hello</title><h1 id="t">ok</h1>')
  console.log('title:', await page.title())
  console.log('dom:', await page.evaluate('document.querySelector("#t").textContent'))
  console.log('fn:', await page.evaluate(() => 1 + 2))
  await page.navigate('https://example.com')
  console.log('url:', await page.url())
  console.log('pages:', JSON.stringify(await browser.listPages()))
  const shot = await page.screenshot()
  console.log('screenshot bytes:', Math.round((shot.length * 3) / 4))
  await page.close()
  console.log('OK')
} finally {
  browser.dispose()
}
if (launched) {
  // leave profile on disk only for the duration of this check
  setTimeout(() => rmSync(userDataDir, { recursive: true, force: true }), 1500)
}
