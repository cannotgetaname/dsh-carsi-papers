/**
 * Reopen the research browser and report its state on the current network.
 * Run with: node test/reopen.mjs
 */
import { Browser, ensureChrome, defaultProfileDir } from '../lib/browser.js'

const port = 9222
const { launched } = await ensureChrome({
  port,
  userDataDir: defaultProfileDir(),
  headless: false,
  startUrl: 'https://ieeexplore.ieee.org/',
})
console.log(`chrome ${launched ? 'started' : 'reused'} · profile ${defaultProfileDir()} · port ${port}`)

const browser = await Browser.connect(port)
const page = await browser.newPage('https://ieeexplore.ieee.org/')
await page.navigate('https://ieeexplore.ieee.org/document/9964813', { settleMs: 2500 })
const state = await page.evaluate(`(() => {
  const text = document.body?.innerText || ''
  const m = text.match(/Access provided by[\\s\\S]{0,70}/i)
  return {
    title: document.title,
    url: location.href,
    institution: m ? m[0].replace(/\\s+/g, ' ').trim() : null,
    paywalled: /institutional sign in|personal sign in|purchase|not included in your subscription/i.test(text),
    snippet: text.replace(/\\s+/g, ' ').slice(0, 240),
  }
})()`)
console.log(JSON.stringify(state, null, 2))
console.log(`tabs: ${JSON.stringify((await browser.listPages()).map(t => t.url))}`)
browser.dispose()
