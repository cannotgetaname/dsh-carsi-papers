/**
 * Record merging and citation export. Pure functions so they can be unit-tested
 * without a browser.
 */

import { toAuthorList } from './naming.js'

/** Comparator key: DOI when present, otherwise a normalized title. */
export function recordKey(record) {
  const doi = String(record.doi ?? '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
  if (doi) return `doi:${doi}`
  const title = String(record.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return title ? `title:${title}` : ''
}

/**
 * Merge records from several databases, keeping the first copy and recording every
 * database that returned it.
 * @param {Array<{publisher: string, records: Array<object>}>} batches
 */
export function mergeRecords(batches) {
  const merged = []
  const seen = new Map()
  for (const { publisher, records } of batches) {
    for (const record of records ?? []) {
      const key = recordKey(record)
      if (key && seen.has(key)) {
        const existing = seen.get(key)
        if (!existing.sources.includes(publisher)) existing.sources.push(publisher)
        continue
      }
      const entry = { ...record, publisher, sources: [publisher] }
      if (key) seen.set(key, entry)
      merged.push(entry)
    }
  }
  return merged
}

/** Escape a value for a BibTeX field. */
function escapeBibtex(value) {
  return String(value ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

/** Citation key: family name + year + first significant title word. */
export function citationKey(record) {
  const author = String(toAuthorList(record.authors)[0] ?? record.author ?? '').trim()
  const family = author.includes(',') ? author.split(',')[0] : author.split(/\s+/).filter(Boolean).at(-1)
  const year = record.year ?? 'nd'
  const word = String(record.title ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)[0]
  return `${(family || 'anon').replace(/[^A-Za-z0-9]/g, '')}${year}${word ? word.slice(0, 6) : ''}`.toLowerCase()
}

/** Render BibTeX entries for a list of records. */
export function toBibtex(records) {
  return records.map(record => {
    const authors = toAuthorList(record.authors).map(name => escapeBibtex(name)).filter(Boolean).join(' and ')
    const venue = record.venue ?? record.journal ?? ''
    const type = /conference|congress|symposium|workshop/i.test(venue) ? 'inproceedings' : 'article'
    const fields = [
      ['title', escapeBibtex(record.title)],
      ['author', authors],
      [type === 'inproceedings' ? 'booktitle' : 'journal', escapeBibtex(venue)],
      ['year', escapeBibtex(record.year)],
      ['doi', escapeBibtex(record.doi)],
      ['url', escapeBibtex(record.url)],
    ].filter(([, value]) => value)
    return `@${type}{${citationKey(record)},\n${fields.map(([key, value]) => `  ${key} = {${value}}`).join(',\n')}\n}`
  }).join('\n\n')
}

/** Render RIS entries for a list of records. */
export function toRis(records) {
  return records.map(record => {
    const venue = record.venue ?? record.journal ?? ''
    const type = /conference|congress|symposium|workshop/i.test(venue) ? 'CPAPER' : 'JOUR'
    const lines = [
      `TY  - ${type}`,
      record.title ? `TI  - ${escapeBibtex(record.title)}` : '',
      ...toAuthorList(record.authors).map(author => `AU  - ${escapeBibtex(author)}`),
      venue ? `JO  - ${escapeBibtex(venue)}` : '',
      record.year ? `PY  - ${escapeBibtex(record.year)}` : '',
      record.doi ? `DO  - ${escapeBibtex(record.doi)}` : '',
      record.url ? `UR  - ${escapeBibtex(record.url)}` : '',
      'ER  - ',
    ]
    return lines.filter(Boolean).join('\n')
  }).join('\n\n')
}
