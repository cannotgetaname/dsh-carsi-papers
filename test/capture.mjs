/**
 * Debug capture: open a URL in the research browser and save everything needed to
 * build or fix an adapter offline — rendered HTML, a screenshot, and the XHR/Fetch
 * responses the page made.
 *
 *   node test/capture.mjs <url> [name] [--wait=6000]
 *
 * Output: debug/<name>/page.html, shot.png, meta.json, network.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Browser } from '../lib/browser.js'

const [url, rawName] = process.argv.slice(2).filter(argument => !argument.startsWith('--'))
const waitArgument = process.argv.find(argument => argument.startsWith('--wait='))
const waitMs = Number(waitArgument?.split('=')[1] ?? 6000)
if (!url) {
  console.error('usage: node test/capture.mjs <url> [name] [--wait=6000]')
  process.exit(1)
}

const name = (rawName || new URL(url).host.replace(/\W+/g, '-')).replace(/[^\w.-]+/g, '-')
const dir = join(process.cwd(), 'debug', name)
mkdirSync(dir, { recursive: true })

const browser = await Browser.connect(9222)
const page = await browser.newPage('about:blank')

const network = []
const requestBodies = new Map()
const off = page.onEvent(message => {
  if (message.method === 'Network.requestWillBeSent') {
    const { request, type } = message.params
    if (type === 'XHR' || type === 'Fetch') {
      requestBodies.set(request.url, { method: request.method, postData: request.postData ?? null })
    }
    return
  }
  if (message.method !== 'Network.responseReceived') return
  const { response, type } = message.params
  if (type !== 'XHR' && type !== 'Fetch') return
  const sent = requestBodies.get(response.url)
  network.push({
    type,
    status: response.status,
    mimeType: response.mimeType,
    url: response.url,
    method: sent?.method ?? null,
    postData: sent?.postData ?? null,
  })
})

await page.send('Network.enable')
await page.navigate(url, { settleMs: waitMs, timeoutMs: 60000 })

const meta = await page.evaluate(`(() => ({
  url: location.href,
  title: document.title,
  textLength: (document.body?.innerText || '').length,
  text: (document.body?.innerText || '').slice(0, 2000),
  iframes: [...document.querySelectorAll('iframe')].map(frame => frame.src).slice(0, 5),
}))()`)
const html = await page.evaluate('document.documentElement.outerHTML')
const shot = await page.screenshot()
off()

writeFileSync(join(dir, 'page.html'), html)
writeFileSync(join(dir, 'shot.png'), Buffer.from(shot, 'base64'))
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
writeFileSync(join(dir, 'network.json'), JSON.stringify(network, null, 2))
browser.dispose()

console.log(`captured ${meta.title} (${meta.url})`)
console.log(`  html:    ${html.length} bytes`)
console.log(`  text:    ${meta.textLength} chars`)
console.log(`  network: ${network.length} XHR/Fetch responses`)
console.log(`  files:   ${dir}`)
if (meta.textLength < 200) console.log(`  page text: ${meta.text.slice(0, 120)}`)
