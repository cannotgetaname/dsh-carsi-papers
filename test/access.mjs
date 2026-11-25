/**
 * Check the access state of each publisher through the real tools.
 * Run with: node test/access.mjs
 */
import { apply } from '../index.js'

const tools = new Map()
apply({
  tools: { register: definition => tools.set(definition.name, definition) },
  effect: () => () => {},
}, { downloadDir: '/tmp/carsi-tools-out' })

const access = tools.get('papers_access')
const targets = [
  ['IEEE Xplore', 'https://ieeexplore.ieee.org/document/9964813'],
  ['Springer', 'https://link.springer.com/article/10.1007/s10586-023-04231-3'],
  // ScienceDirect 单列，见 test/sd.mjs
]

for (const [label, url] of targets) {
  try {
    const result = await access.execute({ url })
    console.log(`### ${label}\n${result.summary}\n`)
  } catch (error) {
    console.log(`### ${label}\nERROR: ${error.message}\n`)
  }
}
