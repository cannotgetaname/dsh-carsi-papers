/**
 * Zotero local-API client. Zotero 7 exposes an HTTP server on 127.0.0.1:23119;
 * reads need nothing, writes need a local API key (`POST /api/local/authorize`,
 * which the user approves once in the Zotero window).
 */

const DEFAULT_BASE = 'http://127.0.0.1:23119'
const DEFAULT_LIBRARY = 'users/0'

/** Split an author string into Zotero creator fields. */
export function creatorOf(name) {
  const text = String(name ?? '').trim()
  if (!text) return undefined
  if (text.includes(',')) {
    const [lastName, ...rest] = text.split(',')
    return { creatorType: 'author', lastName: lastName.trim(), firstName: rest.join(',').trim() }
  }
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { creatorType: 'author', lastName: parts[0], firstName: '' }
  return { creatorType: 'author', lastName: parts.at(-1), firstName: parts.slice(0, -1).join(' ') }
}

/** Map one normalized record onto a Zotero item. */
export function toZoteroItem(record) {
  const venue = record.venue ?? record.journal ?? ''
  const itemType = /conference|congress|symposium|workshop/i.test(venue) ? 'conferencePaper' : 'journalArticle'
  const creators = (Array.isArray(record.authors) ? record.authors : String(record.authors ?? '').split(/[;,]/))
    .map(name => creatorOf(name))
    .filter(Boolean)
  const item = {
    itemType,
    title: String(record.title ?? '').trim(),
  }
  if (creators.length) item.creators = creators
  if (venue) item.publicationTitle = venue
  if (record.year) item.date = String(record.year)
  if (record.doi) item.DOI = String(record.doi)
  if (record.url) item.url = String(record.url)
  return item
}

/** Read the server ID Zotero prints on its own API root. */
async function readServerId(baseUrl) {
  const response = await fetch(`${baseUrl}/api/`)
  const id = response.headers.get('Zotero-Server-ID')
  if (!id) throw new Error('Zotero did not expose a Zotero-Server-ID header')
  return id
}

/**
 * Write records into the local Zotero library.
 * @returns {Promise<{created: number, unchanged: number, failed: number, items: string[]}>}
 */
export async function zoteroWrite(records, options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE
  const library = options.library ?? DEFAULT_LIBRARY
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('a Zotero local API key is required; run the authorization step first')
  const serverId = await readServerId(baseUrl)
  const items = records.map(toZoteroItem).filter(item => item.title)
  if (!items.length) return { created: 0, unchanged: 0, failed: 0, items: [] }
  const response = await fetch(`${baseUrl}/api/${library}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Zotero-API-Key': apiKey,
      'Zotero-Allowed-Request': 'true',
      'Zotero-Server-ID': serverId,
    },
    body: JSON.stringify(items),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Zotero rejected the write (${response.status}): ${text.slice(0, 200)}`)
  const result = JSON.parse(text)
  const keys = Object.values(result.successful ?? {}).map(entry => entry.key)
  return {
    created: keys.length,
    unchanged: Object.keys(result.unchanged ?? {}).length,
    failed: Object.keys(result.failed ?? {}).length,
    items: keys,
  }
}
