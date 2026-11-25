/** Unit tests: no browser, no network. */
import { inspectPdf, countPages } from '../lib/papers.js'
import { buildFileName, familyName, sanitizeName } from '../lib/naming.js'
import { ADAPTERS, resolveAdapter } from '../lib/papers.js'
import { citationKey, mergeRecords, recordKey, toBibtex, toRis } from '../lib/export.js'
import * as pageScripts from '../lib/page-scripts.js'
import { apply } from '../index.js'

export default async function run(t) {
  t.section('naming')
  t.equal('sanitize keeps words', sanitizeName('Thermal runaway: a study?'), 'Thermal runaway a study')
  t.equal('sanitize falls back', sanitizeName(''), 'paper')
  t.equal('sanitize caps length', sanitizeName('x'.repeat(200)).length, 120)
  t.equal('family from western name', familyName('Zhaoqi Chen'), 'Chen')
  t.equal('family from comma form', familyName('Chen, Zhaoqi'), 'Chen')
  t.equal(
    'file name is year-firstAuthor-title',
    buildFileName({ year: '2022', authors: ['Zhaoqi Chen'], title: 'Thermal runaway' }),
    '2022-Chen-Thermal runaway',
  )
  t.equal('file name degrades without metadata', buildFileName({}), '')
  t.equal('file name survives a missing author', buildFileName({ year: '2024', title: 'X' }), '2024-X')
  t.equal(
    'file name accepts a comma-separated author string',
    buildFileName({ year: '2023', authors: 'A. Author, B. Author', title: 'Federated clouds' }),
    '2023-Author-Federated clouds',
  )

  t.section('pdf inspection')
  t.ok('detects a pdf signature', inspectPdf(Buffer.from('%PDF-1.7 body')).isPdf)
  t.ok('rejects html', !inspectPdf(Buffer.from('<!doctype html>')).isPdf)
  t.equal('reports byte length', inspectPdf(Buffer.from('%PDF-1.7  ') ).bytes, 10)
  t.equal(
    'page count falls back to /Count when pdfinfo cannot read a path',
    countPages('/nonexistent/file.pdf', Buffer.from('%PDF-1.7 /Type /Pages /Count 12 trailer')),
    12,
  )

  t.section('adapters')
  t.deepEqual('three adapters registered', ADAPTERS.map(adapter => adapter.name), ['ieee', 'springer', 'sd'])
  for (const adapter of ADAPTERS) {
    t.ok(`${adapter.name} has the required shape`,
      Boolean(adapter.label && adapter.origin && typeof adapter.match === 'function'
        && typeof adapter.search === 'function' && typeof adapter.pdf === 'function'))
  }
  t.ok('ieee matches its host', resolveAdapter('https://ieeexplore.ieee.org/document/1')?.name === 'ieee')
  t.ok('springer matches its host', resolveAdapter('https://link.springer.com/article/10.1007/x')?.name === 'springer')
  t.ok('sd matches its host', resolveAdapter('https://www.sciencedirect.com/science/article/pii/X')?.name === 'sd')
  t.ok('unknown host resolves to nothing', resolveAdapter('https://example.com/x') === undefined)
  t.ok('name lookup works', resolveAdapter('sd')?.name === 'sd')

  t.section('page functions stay self-contained')
  const names = Object.keys(pageScripts).filter(key => typeof pageScripts[key] === 'function')
  t.ok('fixtures expose page functions', names.length >= 8)
  for (const name of names) {
    const source = pageScripts[name].toString()
    t.ok(`${name} has no module imports`, !/\bimport\s|\brequire\s*\(|\bmodule\.exports\b/.test(source))
  }

  t.section('record merging')
  t.equal('doi key wins', recordKey({ doi: '10.1109/X.2022.1', title: 'A' }), 'doi:10.1109/x.2022.1')
  t.equal('doi urls normalize', recordKey({ doi: 'https://doi.org/10.1109/X' }), 'doi:10.1109/x')
  t.equal('title fallback', recordKey({ title: 'A  Study!' }), 'title:astudy')
  const merged = mergeRecords([
    { publisher: 'ieee', records: [{ doi: '10.1/a', title: 'Same', year: '2022', access: 'subscribed' }] },
    { publisher: 'sd', records: [{ doi: '10.1/A', title: 'Same', year: '2022' }, { title: 'Other', year: '2024' }] },
  ])
  t.equal('duplicates collapse', merged.length, 2)
  t.deepEqual('sources accumulate', merged[0].sources, ['ieee', 'sd'])
  t.equal('first copy wins', merged[0].access, 'subscribed')
  t.equal('publisher recorded', merged[1].publisher, 'sd')

  t.section('citation export')
  const sample = [{
    title: 'Thermal runaway analysis',
    authors: ['Zhaoqi Chen', 'Peng Huang'],
    venue: '2022 6th CAA International Conference on Vehicular Control',
    year: '2022',
    doi: '10.1109/CVCI56766.2022.9964813',
    url: 'https://ieeexplore.ieee.org/document/9964813',
  }]
  t.ok('citation key is derived', /^chen2022/.test(citationKey(sample[0])))
  const bib = toBibtex(sample)
  t.ok('bibtex is a conference entry', bib.startsWith('@inproceedings{'))
  t.ok('bibtex carries the doi', bib.includes('doi = {10.1109/CVCI56766.2022.9964813}'))
  t.ok('bibtex joins authors', bib.includes('author = {Zhaoqi Chen and Peng Huang}'))
  const springerSample = [{ title: 'Federated clouds', authors: 'A. Author, B. Author', year: '2023' }]
  t.ok('bibtex splits a string author field',
    toBibtex(springerSample).includes('author = {A. Author and B. Author}'))
  t.ok('ris splits a string author field',
    toRis(springerSample).includes('AU  - B. Author'))
  const ris = toRis(sample)
  t.ok('ris is a conference paper', ris.includes('TY  - CPAPER'))
  t.ok('ris ends with ER', ris.trim().endsWith('ER  -'))
  t.ok('ris lists both authors', ris.includes('AU  - Zhaoqi Chen') && ris.includes('AU  - Peng Huang'))

  t.section('tool schemas')
  const tools = new Map()
  apply({ tools: { register: definition => tools.set(definition.name, definition) }, effect: () => () => {} }, {})
  t.deepEqual('eight tools registered', [...tools.keys()], [
    'papers_status', 'papers_open', 'papers_search', 'papers_fetch', 'papers_login', 'papers_access',
    'papers_export', 'papers_eval',
  ])
  for (const [name, tool] of tools) {
    const schema = tool.parameters
    t.ok(`${name} declares an object schema`, schema?.type === 'object')
    t.ok(`${name} forbids extra properties`, schema?.additionalProperties === false)
    if (schema?.required !== undefined) {
      t.ok(`${name} required is an array`, Array.isArray(schema.required))
      const declared = Object.keys(schema.properties ?? {})
      t.ok(`${name} required names are declared`, schema.required.every(key => declared.includes(key)))
    }
    for (const [property, spec] of Object.entries(schema?.properties ?? {})) {
      t.ok(`${name}.${property} has no property-level required flag`, typeof spec.required !== 'boolean')
    }
  }
}
