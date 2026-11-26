/** Unit tests: no browser, no network. */
import { inspectPdf, countPages } from '../lib/papers.js'
import { buildFileName, familyName, sanitizeName } from '../lib/naming.js'
import { ADAPTERS, resolveAdapter } from '../lib/papers.js'
import { citationKey, mergeRecords, recordKey, toBibtex, toGb7714, toRis } from '../lib/export.js'
import { needsEnrichment } from '../lib/enrich.js'
import { creatorOf, toZoteroItem } from '../lib/zotero.js'
import { summarizeChecks } from '../lib/doctor.js'
import { parseBibtex, parseNumbered, titleSimilarity, toGb7714 as toGbEntry, verifyEntry } from '../lib/refs.js'
import { extractIp, judgePool, localAddresses, prefixOf } from '../lib/network.js'
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
  t.deepEqual('five adapters registered', ADAPTERS.map(adapter => adapter.name), ['ieee', 'springer', 'sd', 'cnki', 'wanfang'])
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
  t.ok('cnki matches its host', resolveAdapter('https://kns.cnki.net/kcms2/article/abstract?v=x')?.name === 'cnki')
  t.ok('wanfang matches its host', resolveAdapter('https://d.wanfangdata.com.cn/periodical/x')?.name === 'wanfang')

  t.section('page functions stay self-contained')
  const names = Object.keys(pageScripts).filter(key => typeof pageScripts[key] === 'function')
  t.ok('fixtures expose page functions', names.length >= 8)
  for (const name of names) {
    const source = pageScripts[name].toString()
    t.ok(`${name} has no module imports`, !/\bimport\s|\brequire\s*\(|\bmodule\.exports\b/.test(source))
    const others = names.filter(other => other !== name)
    const leaked = others.filter(other => new RegExp(`\\b${other}\\b`).test(source))
    t.deepEqual(`${name} does not call other page functions`, leaked, [])
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

  t.section('zotero mapping')
  t.deepEqual('western name split', creatorOf('Zhaoqi Chen'), { creatorType: 'author', lastName: 'Chen', firstName: 'Zhaoqi' })
  t.deepEqual('comma form split', creatorOf('Chen, Zhaoqi'), { creatorType: 'author', lastName: 'Chen', firstName: 'Zhaoqi' })
  t.equal('single name survives', creatorOf('Plato').lastName, 'Plato')
  const conference = toZoteroItem({
    title: 'Thermal runaway', authors: ['Zhaoqi Chen', 'Peng Huang'],
    venue: '2022 6th CAA International Conference on Vehicular Control', year: '2022',
    doi: '10.1109/CVCI.2022.1', url: 'https://ieeexplore.ieee.org/document/1',
  })
  t.equal('conference venue maps to conferencePaper', conference.itemType, 'conferencePaper')
  t.equal('title kept', conference.title, 'Thermal runaway')
  t.equal('creators built', conference.creators.length, 2)
  t.equal('doi kept', conference.DOI, '10.1109/CVCI.2022.1')
  const journal = toZoteroItem({ title: 'X', venue: 'Neural Networks', year: '2027' })
  t.equal('journal maps to journalArticle', journal.itemType, 'journalArticle')
  t.equal('venue becomes publicationTitle', journal.publicationTitle, 'Neural Networks')
  t.equal('string authors split', toZoteroItem({ title: 'Y', authors: 'A. Author, B. Author' }).creators.length, 2)

  t.section('doctor summary')
  const line = summarizeChecks([
    { label: 'browser', status: 'ok', detail: 'up' },
    { label: 'zotero', status: 'warn', detail: 'no key' },
    { label: 'disk', status: 'fail', detail: 'denied' },
  ])
  t.ok('counts every status', line.startsWith('doctor: 1 ok, 1 warning(s), 1 failure(s)'))
  t.ok('marks ok', line.includes('✅ browser: up'))
  t.ok('marks warning', line.includes('⚠️ zotero: no key'))
  t.ok('marks failure', line.includes('❌ disk: denied'))

  t.section('GB/T 7714 export')
  const gb = toGb7714([
    { title: '基于微环的脉冲神经网络', authors: ['何香玉', '郭鹏星', '卢冰', '李斌'], venue: '中国激光', year: '2026' },
    { title: 'Conference paper', authors: ['Zhaoqi Chen'], venue: '2022 6th CAA International Conference', year: '2022' },
    { title: 'A thesis', authors: [], venue: '学位论文', year: '2025' },
  ])
  t.ok('numbers entries', gb.startsWith('[1] '))
  t.ok('truncates to three authors with 等', gb.includes('何香玉, 郭鹏星, 卢冰, 等.'))
  t.ok('tags a journal as J', gb.includes('[J]. 中国激光, 2026.'))
  t.ok('tags a conference as C', gb.includes('[C].'))
  t.ok('tags a thesis as D', gb.includes('[D].'))
  t.ok('falls back for missing authors', gb.includes('佚名'))

  t.section('enrichment need')
  t.ok('needs authors', needsEnrichment({ doi: '10.1/a', title: 'x' }))
  t.ok('needs venue', needsEnrichment({ doi: '10.1/a', authors: ['A'], title: 'x' }))
  t.ok('complete record skips', !needsEnrichment({ doi: '10.1/a', authors: ['A'], venue: 'V', year: '2020', title: 'x' }))
  t.ok('no doi skips', !needsEnrichment({ authors: [], title: 'x' }))

  t.section('reference parsing')
  const refBib = parseBibtex(`@article{x, title={Thermal runaway}, author={A. One and B. Two}, journal={Measurement}, year={2022}, doi={10.1/x}}`)
  t.equal('bib entries', refBib.length, 1)
  t.equal('bib title', refBib[0].title, 'Thermal runaway')
  t.equal('bib authors', refBib[0].authors.length, 2)
  const numbered = parseNumbered('[1] First, 2019.\n[2] Second, 2020.')
  t.equal('numbered entries', numbered.length, 2)
  t.ok('numbered keeps the index', numbered[0].index === 1)
  t.ok('title similarity is 1 for identical', titleSimilarity('a b c', 'a b c') === 1)
  t.ok('gb entry has the J tag', toGbEntry({ title: 'X', venue: 'Journal', year: '2020' }, 1).includes('[J]'))

  t.section('reference verification')
  const mocked = async () => ({ ok: true, status: 200, json: async () => ({ message: { DOI: '10.1/x', title: ['Thermal runaway'], author: [{ family: 'One', given: 'A' }], issued: { 'date-parts': [[2022]] }, 'container-title': ['Measurement'] } }) })
  const verified = await verifyEntry({ title: 'Thermal runaway', doi: '10.1/x' }, { fetchImpl: mocked })
  t.equal('doi verified', verified.status, 'verified')
  t.equal('crossref author mapped', verified.found.authors[0], 'One A')

  t.section('campus network')
  t.equal('prefix of ipv4', prefixOf('202.113.69.46'), '202.113')
  t.equal('prefix of ipv6', prefixOf('2001:da8:215::1'), '2001:da8')
  t.equal('pool judges campus', judgePool(['123.1.1.1', '202.113.1.1'], ['202.113']), 'campus')
  t.equal('pool judges off-campus', judgePool(['123.1.1.1'], ['202.113']), 'off-campus')
  t.equal('extracts a decorated ip', extractIp('当前 IP：123.150.255.253 来自于：中国'), '123.150.255.253')
  t.ok('interfaces skip loopback', localAddresses({ lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }).length === 0)

  t.section('tool schemas')
  const tools = new Map()
  apply({ tools: { register: definition => tools.set(definition.name, definition) }, effect: () => () => {} }, {})
  t.deepEqual('fifteen tools registered', [...tools.keys()], [
    'papers_status', 'papers_open', 'papers_search', 'papers_fetch', 'papers_login', 'papers_access',
    'papers_export', 'papers_zotero', 'papers_enrich', 'papers_doctor',
    'ref_audit', 'ref_format', 'campus_status', 'campus_mark', 'papers_eval',
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
