/**
 * File naming for saved PDFs: `year-firstAuthor-title`. Pure functions so the
 * naming rules can be unit-tested without a browser.
 */

/** Reduce a title or arbitrary string to a safe file name stem. */
export function sanitizeName(value) {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'paper'
}

/**
 * Normalize an author field to a list: publishers return either an array or one
 * "A. Author, B. Author" string.
 */
export function toAuthorList(authors) {
  if (Array.isArray(authors)) return authors.map(name => String(name).trim()).filter(Boolean)
  if (typeof authors === 'string') {
    return authors.split(/[;,]/).map(name => name.trim()).filter(Boolean)
  }
  return []
}

/** Family name of an author string such as "Zhaoqi Chen" or "Chen, Zhaoqi". */
export function familyName(author) {
  const text = String(author ?? '').trim()
  if (!text) return ''
  if (text.includes(',')) return text.split(',')[0].trim()
  const parts = text.split(/\s+/).filter(Boolean)
  return parts.at(-1) ?? ''
}

/** Compose `year-firstAuthor-title` from citation metadata. */
export function buildFileName(metadata = {}) {
  const first = familyName(toAuthorList(metadata.authors)[0])
  const parts = [metadata.year, first, metadata.title].filter(Boolean)
  return parts.length ? parts.join('-') : ''
}
