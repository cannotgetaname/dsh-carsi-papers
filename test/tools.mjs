/**
 * Integration check without DSH: registers the tools against a stub ctx and calls
 * them for real against the running research browser.
 *
 * Run with: node test/tools.mjs
 */
import { rmSync, readdirSync } from 'node:fs'
import { apply } from '../index.js'

const tools = new Map()
const ctx = {
  tools: { register: definition => tools.set(definition.name, definition) },
  effect: () => () => {},
}

const outDir = '/tmp/carsi-tools-out'
rmSync(outDir, { recursive: true, force: true })
apply(ctx, { downloadDir: outDir })
console.log(`tools: ${[...tools.keys()].join(', ')}`)

const search = tools.get('papers_search')
const found = await search.execute({ query: 'lithium battery thermal runaway', rows: 3 })
console.log('\n--- search ---\n' + found.summary.slice(0, 600))

const best = found.records.find(record => record.access === 'subscribed') ?? found.records[0]
console.log(`\nfirst record: ${best.title} (${best.documentId})`)

const fetchTool = tools.get('papers_fetch')
const fetched = await fetchTool.execute({ publisher: 'ieee', documentId: best.documentId, filename: 'probe' })
console.log('\n--- fetch ---\n' + fetched.summary)
console.log('files:', readdirSync(outDir))
