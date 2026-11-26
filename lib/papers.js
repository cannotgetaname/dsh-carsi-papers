/**
 * Publisher adapters. Each adapter runs page-context requests so the institutional
 * session and its cookies stay where they belong: inside the browser.
 *
 * An adapter is
 * `{ name, label, origin, match, search(page, query, options), pdf(page, record), articleUrl?, metadata? }`.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  blobSave,
  citationMeta,
  clickByText,
  cnkiDownloadLinks,
  cnkiFetchGrid,
  cnkiParseGrid,
  fetchBase64,
  firstHref,
  ieeeMetadata,
  ieeeSearch,
  institutionalEntries,
  pageExcerpt,
  readPageSignals,
  sdSearch,
  springerSearch,
  wanfangDownloadLink,
  wanfangSearch,
} from './page-scripts.js'

const toBuffer = base64 => Buffer.from(base64, 'base64')

/** An error the retry wrapper may try again (network, 5xx, transient parse). */
export class RetryableError extends Error {
  constructor(message, options = {}) {
    super(message, options)
    this.name = 'RetryableError'
    this.retryable = true
  }
}

/** Remove IEEE's inline highlight markers from text fields. */
function stripHighlights(value) {
  return String(value ?? '').replace(/\[::|::\]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** Normalize one IEEE record. */
function normalizeIeee(record) {
  const authors = (record.authors ?? [])
    .map(author => author.preferredName || author.normalizedName || '')
    .filter(Boolean)
  return {
    title: stripHighlights(record.articleTitle),
    authors,
    venue: stripHighlights(record.publicationTitle),
    year: record.publicationYear,
    doi: record.doi,
    citations: record.citationCount ?? null,
    access: record.accessType?.type ?? null,
    accessMessage: record.accessType?.message ?? null,
    documentId: String(record.articleNumber ?? ''),
    url: record.articleNumber ? `https://ieeexplore.ieee.org/document/${record.articleNumber}` : undefined,
    isOpenAccess: Boolean(record.isOpenAccess),
  }
}

/** IEEE Xplore: search through the site's own REST endpoint, download the stamped PDF. */
const ieee = {
  name: 'ieee',
  label: 'IEEE Xplore',
  origin: 'https://ieeexplore.ieee.org/',
  match: url => /ieeexplore\.ieee\.org/.test(url),
  articleUrl: record => (record.documentId ? `https://ieeexplore.ieee.org/document/${record.documentId}` : undefined),
  metadata: page => page.call(ieeeMetadata),

  async search(page, query, options = {}) {
    const payload = {
      queryText: query,
      highlight: true,
      returnType: 'SEARCH',
      matchPubs: true,
      rowsPerPage: String(Math.min(Math.max(options.rows ?? 10, 1), 50)),
      pageNumber: options.page ?? 1,
    }
    const result = await page.call(ieeeSearch, payload)
    if (!result?.data) throw new RetryableError(`IEEE search failed (${result?.status}): ${result?.error ?? 'no body'}`)
    return {
      total: result.data.totalRecords ?? null,
      records: (result.data.records ?? []).map(normalizeIeee),
    }
  },

  async pdf(page, record) {
    const documentId = record.documentId || String(record.articleNumber ?? '')
    if (!documentId) throw new Error('IEEE download needs a documentId')
    const url = `https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=${documentId}`
    const result = await page.call(fetchBase64, url)
    if (!result?.b64) throw new RetryableError(`IEEE PDF request returned ${result?.status ?? 'no bytes'}`)
    return { buffer: toBuffer(result.b64), contentType: result.ctype }
  },
}

/** Springer Nature Link: search the result page, download through the article PDF link. */
const springer = {
  name: 'springer',
  label: 'Springer Nature Link',
  origin: 'https://link.springer.com/',
  match: url => /link\.springer\.com/.test(url),
  articleUrl: record => record.url,
  metadata: page => page.call(citationMeta),

  async search(page, query, options = {}) {
    const rows = Math.min(Math.max(options.rows ?? 10, 1), 50)
    const url = `https://link.springer.com/search?query=${encodeURIComponent(query)}`
      + `${options.yearFrom ? `&start-date=${options.yearFrom}-01-01` : ''}`
      + `${options.yearTo ? `&end-date=${options.yearTo}-12-31` : ''}`
    await page.navigate(url, { settleMs: 1200 })
    return { total: null, records: await page.call(springerSearch, rows) }
  },

  async pdf(page, record) {
    if (!record.url) throw new Error('Springer download needs the article URL')
    await page.navigate(record.url, { settleMs: 1200 })
    const href = await page.call(firstHref, 'a[data-track-action="download pdf"], a[href*=".pdf"], a[href*="/content/pdf/"]')
    if (!href) throw new Error('Springer shows no PDF link on this article (paywall or no full text)')
    const result = await page.call(fetchBase64, href)
    if (!result?.b64) throw new RetryableError(`Springer PDF request returned ${result?.status ?? 'no bytes'}`)
    return { buffer: toBuffer(result.b64), contentType: result.ctype }
  },
}

/** ScienceDirect: search the result page, download the signed asset through the page. */
const sd = {
  name: 'sd',
  label: 'ScienceDirect',
  origin: 'https://www.sciencedirect.com/',
  match: url => /sciencedirect\.com/.test(url),
  articleUrl: record => {
    const pii = record.pii || (record.url || '').match(/pii\/([A-Z0-9]+)/)?.[1]
    return pii ? `https://www.sciencedirect.com/science/article/pii/${pii}` : undefined
  },
  metadata: page => page.call(citationMeta),

  async search(page, query, options = {}) {
    const rows = Math.min(Math.max(options.rows ?? 10, 1), 50)
    await page.navigate(`https://www.sciencedirect.com/search?qs=${encodeURIComponent(query)}`, { settleMs: 5000 })
    return { total: null, records: await page.call(sdSearch, rows) }
  },

  async pdf(page, record) {
    const pii = record.pii || (record.url || '').match(/pii\/([A-Z0-9]+)/)?.[1]
    if (!pii) throw new Error('ScienceDirect download needs a PII')
    await page.navigate(`https://www.sciencedirect.com/science/article/pii/${pii}`, { settleMs: 3500 })
    const href = await page.call(firstHref, 'a[href*="/pdfft?"]')
    if (!href) throw new Error('ScienceDirect shows no PDF link here (paywall, challenge, or no full text)')
    const signed = await page.resolvePdfUrl(href, { timeoutMs: 45_000 })
    const dir = join(tmpdir(), `carsi-sd-${Date.now()}`)
    try {
      const path = await page.saveUrlToFile(signed, dir, `${pii}.pdf`, { timeoutMs: 120_000 })
      return { buffer: readFileSync(path), contentType: 'application/pdf' }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

/** CNKI (中国知网): grid endpoint for search, the article page's PDF button for download. */
const cnki = {
  name: 'cnki',
  label: '中国知网',
  origin: 'https://kns.cnki.net/',
  match: url => /cnki\.net/.test(url),
  articleUrl: record => record.url,
  metadata: page => page.call(citationMeta),

  async search(page, query, options = {}) {
    const fetched = await page.call(cnkiFetchGrid, { query, page: options.page ?? 1 })
    if (fetched?.challenge) throw new Error('CNKI 要求安全验证：请在浏览器窗口完成滑块验证后重试')
    if (!fetched?.html) throw new RetryableError(`CNKI search failed (${fetched?.status ?? '?'})`)
    const parsed = await page.call(cnkiParseGrid, fetched.html)
    const limit = Math.min(Math.max(options.rows ?? 10, 1), 20)
    return { total: parsed.total, records: parsed.records.slice(0, limit) }
  },

  async pdf(page, record) {
    if (!record.url) throw new Error('CNKI download needs the article URL')
    await page.navigate(record.url, { settleMs: 2500 })
    const access = await page.call(readPageSignals)
    if (access.challenge) throw new Error('CNKI 要求安全验证：请在浏览器窗口完成滑块验证后重试')
    const links = await page.call(cnkiDownloadLinks)
    if (!links?.pdf) throw new Error('CNKI 文章页没有 PDF 下载按钮（可能未登录或该刊不在订阅内）')
    const dir = join(tmpdir(), `carsi-cnki-${Date.now()}`)
    try {
      const path = await page.clickDownload(links.pdf, dir, { timeoutMs: 120_000 })
      return { buffer: readFileSync(path), contentType: 'application/pdf' }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

/** Wanfang (万方): the SPA's result page for search, the detail page's download link for the PDF. */
const wanfang = {
  name: 'wanfang',
  label: '万方',
  origin: 'https://s.wanfangdata.com.cn/',
  match: url => /wanfangdata\.com\.cn/.test(url),
  articleUrl: record => record.url,
  metadata: page => page.call(citationMeta),

  async search(page, query, options = {}) {
    await page.navigate(`https://s.wanfangdata.com.cn/paper?q=${encodeURIComponent(query)}`, { settleMs: 6000 })
    const records = await page.call(wanfangSearch, Math.min(Math.max(options.rows ?? 10, 1), 20))
    return { total: null, records }
  },

  async pdf(page, record) {
    if (!record.url) throw new Error('万方下载需要详情页地址')
    await page.navigate(record.url, { settleMs: 5000 })
    const access = await page.call(readPageSignals)
    if (access.challenge) throw new Error('万方要求安全验证：请在浏览器窗口完成后重试')
    const href = await page.call(wanfangDownloadLink)
    if (!href) {
      throw new Error('万方详情页没有可用的全文下载按钮：通常表示机构订阅余额不足或该篇不在订购范围')
    }
    await page.navigate(href, { settleMs: 1500, timeoutMs: 20_000 }).catch(() => {})
    const landed = await page.url().catch(() => '')
    if (/my\.wanfangdata\.com\.cn\/user\/transaction/.test(landed)) {
      throw new Error('万方机构账号余额不足，全文下载不可用（请联系图书馆）')
    }
    const dir = join(tmpdir(), `carsi-wf-${Date.now()}`)
    try {
      const path = await page.clickDownload(href, dir, { timeoutMs: 60_000 })
      return { buffer: readFileSync(path), contentType: 'application/pdf' }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

export const ADAPTERS = [ieee, springer, sd, cnki, wanfang]

/** Resolve an adapter by name or by the page URL. */
export function resolveAdapter(nameOrUrl) {
  if (!nameOrUrl) return undefined
  return ADAPTERS.find(adapter => adapter.name === nameOrUrl || adapter.match(nameOrUrl))
}

/** Read the page's own report of institutional entitlement and paywall state. */
export function readAccess(page) {
  return page.call(readPageSignals)
}

/** Highwire citation metadata from the current article page. */
export function readMetadata(page) {
  return page.call(citationMeta)
}

/** Institutional sign-in entry points present on the current page. */
export function findInstitutionalEntry(page) {
  return page.call(institutionalEntries)
}

/** Click the control whose visible label matches exactly. */
export function clickByLabel(page, label) {
  return page.call(clickByText, label)
}

/**
 * Page count for a saved PDF: pdfinfo when poppler is installed, otherwise the
 * largest page-tree `/Count` in the raw bytes.
 */
export function countPages(path, buffer) {
  try {
    const info = execFileSync('pdfinfo', [path], { timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const match = info.match(/^Pages:\s+(\d+)/m)
    if (match) return Number(match[1])
  } catch {
    /* pdfinfo missing or refused the file; fall through to the byte heuristic */
  }
  const text = buffer.toString('latin1')
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map(hit => Number(hit[1]))
  return counts.length ? Math.max(...counts) : (text.split('/Type /Page').length - 1)
}

/** Verify that downloaded bytes really are a PDF. */
export function inspectPdf(buffer) {
  return {
    isPdf: buffer.subarray(0, 5).toString('latin1') === '%PDF-',
    bytes: buffer.length,
  }
}

/** Re-exported so tests can exercise the page functions directly. */
export { blobSave, pageExcerpt, readPageSignals }
