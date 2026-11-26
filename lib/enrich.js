/**
 * Metadata enrichment through Crossref: our CNKI and ScienceDirect records often lack
 * authors or venue, and Crossref answers by DOI for free.
 */

/** Ask Crossref for one DOI; returns the fields we can fill. */
export async function crossrefByDoi(doi, { timeoutMs = 8000 } = {}) {
  const clean = String(doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  if (!clean) return null
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, {
    headers: { 'User-Agent': 'dsh-carsi-papers (https://github.com/cannotgetaname/dsh-carsi-papers)' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) return null
  const { message } = await response.json()
  if (!message) return null
  const authors = (message.author ?? [])
    .map(person => [person.given, person.family].filter(Boolean).join(' ').trim())
    .filter(Boolean)
  const year = message['published-print']?.['date-parts']?.[0]?.[0]
    ?? message['published-online']?.['date-parts']?.[0]?.[0]
    ?? message.issued?.['date-parts']?.[0]?.[0]
    ?? null
  return {
    title: message.title?.[0],
    authors,
    venue: message['container-title']?.[0] ?? message.event?.name,
    year: year ? String(year) : null,
    doi: message.DOI,
    type: message.type,
  }
}

/** True when a record lacks the fields Crossref could fill. */
export function needsEnrichment(record) {
  return Boolean(record?.doi) && (!record.authors?.length || !record.venue || !record.year)
}

/** Fill missing fields in place and report which ones changed. */
export async function enrichRecords(records, { log = () => {} } = {}) {
  const filled = []
  for (const record of records) {
    if (!needsEnrichment(record)) continue
    let meta = null
    try {
      meta = await crossrefByDoi(record.doi)
    } catch (error) {
      log(`crossref failed for ${record.doi}: ${error.message}`)
    }
    if (!meta) continue
    const changed = []
    if (!record.authors?.length && meta.authors?.length) {
      record.authors = meta.authors
      changed.push('authors')
    }
    if (!record.venue && meta.venue) {
      record.venue = meta.venue
      changed.push('venue')
    }
    if (!record.year && meta.year) {
      record.year = meta.year
      changed.push('year')
    }
    if (!record.title && meta.title) {
      record.title = meta.title
      changed.push('title')
    }
    if (changed.length) filled.push({ doi: record.doi, changed })
  }
  return filled
}
