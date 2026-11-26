/**
 * Functions that run *inside the page*. They are serialized with
 * `Function.prototype.toString` and injected, so each one must be self-contained:
 * no imports, no closure over module scope. Keeping them here means the syntax
 * checker and the unit tests see them as ordinary JavaScript instead of strings
 * that only fail at runtime.
 */

/** Institution, paywall, and challenge signals read from the visible page. */
export function readPageSignals() {
  const text = (document.body && document.body.innerText) || ''
  const match = text.match(/Access provided by[:\s]+([^\n]{3,80})/i)
  let institution = match ? match[1].replace(/\s+/g, ' ').trim() : null
  if (institution) {
    // Inline markup can glue the next control onto the organisation name.
    institution = institution.split(/\s(?:Full text|Download|Sign Out|View PDF|Access through)\b/i)[0].trim()
  }
  return {
    title: document.title,
    url: location.href,
    institution,
    fullText: /full text access|view pdf|download pdf/i.test(text),
    paywalled: /buy article|purchase pdf|get access|purchase this article|rent this article|subscribe to (read|view)/i.test(text),
    challenge: (() => {
      if (/are you a robot|just a moment|verify you are human|checking your browser/i.test(text)) return true
      if (/\/verify\//.test(location.pathname)) return true
      return /安全验证|滑动验证/.test(document.title)
    })(),
  }
}

/** IEEE Xplore search through the site's own endpoint. */
export async function ieeeSearch(payload) {
  const response = await fetch('https://ieeexplore.ieee.org/rest/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (!response.ok) return { status: response.status, error: text.slice(0, 300) }
  return { status: response.status, data: JSON.parse(text) }
}

/** IEEE publishes no Highwire tags, so read the visible record instead. */
export function ieeeMetadata() {
  const text = (document.body && document.body.innerText || '').replace(/\s{2,}/g, ' ')
  const title = (document.querySelector('h1.document-title')?.textContent
    || (document.title || '').split('|')[0]).replace(/\s+/g, ' ').trim()
  const yearFrom = pattern => {
    const hit = text.match(pattern)
    return hit ? (hit[0].match(/(19|20)\d{2}/) || [null])[0] : null
  }
  const authors = [...document.querySelectorAll('#authors .authors-info a, .authors-info a')]
    .map(element => (element.textContent || '').trim()).filter(Boolean).slice(0, 5)
  return {
    title,
    year: yearFrom(/Date of Publication:[^\n]{0,40}/) || yearFrom(/Published in:[^\n]{0,80}/),
    authors,
  }
}

/** Highwire citation tags used by Springer and ScienceDirect article pages. */
export function citationMeta() {
  const pick = name => (document.querySelector(`meta[name="${name}"]`)?.content || '').trim()
  const authors = [...document.querySelectorAll('meta[name="citation_author"]')]
    .map(element => element.content.trim())
  const date = pick('citation_publication_date') || pick('citation_date') || ''
  return {
    title: pick('citation_title') || (document.title || '').split('|')[0].trim(),
    journal: pick('citation_journal_title'),
    year: (date.match(/(19|20)\d{2}/) || [null])[0],
    doi: pick('citation_doi'),
    authors,
  }
}

/** ScienceDirect result list. */
export function sdSearch(rows) {
  const links = [...document.querySelectorAll('a[href*="/science/article/pii/"]')]
  const seen = new Set()
  const out = []
  for (const anchor of links) {
    const href = anchor.getAttribute('href') || ''
    const matched = href.match(/pii\/([A-Z0-9]+)/)
    if (!matched) continue
    const pii = matched[1]
    if (seen.has(pii)) continue
    const title = (anchor.textContent || '').trim()
    if (!title || /view pdf|download/i.test(title)) continue
    const container = anchor.closest('li') || anchor.closest('article') || anchor.parentElement
    const text = (container?.innerText || '').replace(/\s+/g, ' ').trim()
    seen.add(pii)
    out.push({
      title,
      pii,
      url: `https://www.sciencedirect.com/science/article/pii/${pii}`,
      year: (text.match(/\b(19|20)\d{2}\b/) || [null])[0],
      access: /view pdf|full text access|open access/i.test(text) ? 'available' : null,
    })
    if (out.length >= rows) break
  }
  return out
}

/** Springer Nature Link result list. */
export function springerSearch(rows) {
  const items = [...document.querySelectorAll('li.app-card-open, li[data-test="search-result"]')]
  return items.slice(0, rows).map(item => {
    const link = item.querySelector('a[data-test="title"]') || item.querySelector('h3 a') || item.querySelector('a')
    const text = selector => (item.querySelector(selector)?.textContent || '').trim()
    return {
      title: (link?.textContent || '').trim(),
      url: link?.href || '',
      venue: text('[data-test="journal-title"], .c-meta__item--journal'),
      authors: text('[data-test="authors"], .c-meta__item--authors'),
      year: (item.textContent || '').match(/\b(19|20)\d{2}\b/)?.[0] || null,
      access: /full access|open access/i.test(item.textContent || '') ? 'available' : null,
    }
  })
}

/** First anchor href matching a selector. */
export function firstHref(selector) {
  const anchor = document.querySelector(selector)
  return anchor ? anchor.href : null
}

/** Fetch a URL in the page and return its bytes as base64. */
export async function fetchBase64(url) {
  const response = await fetch(url, { credentials: 'include' })
  const type = response.headers.get('content-type') || ''
  if (!response.ok) return { status: response.status, ctype: type }
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192))
  }
  return { status: response.status, ctype: type, size: bytes.length, b64: btoa(binary) }
}

/** Fetch a URL in the page and hand the bytes to the browser's download path. */
export async function blobSave(url, filename) {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) return { status: response.status }
  const blob = await response.blob()
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(anchor.href), 120000)
  return { status: response.status, size: blob.size }
}

/** Institutional sign-in entry points on the page. */
export function institutionalEntries() {
  const pattern = /institution|shibboleth|carsi|机构|access through your organization/i
  return [...document.querySelectorAll('a,button,[role="button"]')]
    .map(element => ({ label: (element.textContent || '').trim().slice(0, 80), href: element.href || '' }))
    .filter(entry => pattern.test(`${entry.label} ${entry.href}`))
    .slice(0, 8)
}

/** Click the control whose visible label matches exactly. */
export function clickByText(label) {
  const target = [...document.querySelectorAll('a,button,[role="button"]')]
    .find(element => (element.textContent || '').trim() === label)
  if (!target) return { clicked: false }
  target.click()
  return { clicked: true, href: target.href || '' }
}

/** Page text excerpt used for quick diagnostics. */
export function pageExcerpt(limit) {
  return ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, limit)
}

/** CNKI search: POST the grid endpoint and return its HTML fragment. */
export async function cnkiFetchGrid(payload) {
  const queryJson = {
    Platform: '',
    Resource: 'CROSSDB',
    Classid: 'WD0FTY92',
    Products: '',
    QNode: {
      QGroup: [{
        Key: 'Subject',
        Title: '',
        Logic: 0,
        Items: [{
          Field: payload.field || 'SU',
          Value: payload.query,
          Operator: 'TOPRANK',
          Logic: 0,
          Vector: '',
          Title: '主题',
        }],
        ChildItems: [],
      }],
    },
    ExScope: 1,
    SimpTrad: '0',
    SearchType: 2,
    Rlang: 'CHINESE',
    KuaKuCode: 'YSTT4HG0,LSTPFY1C,EMRPGLPA,JUP3MUPD,MPMFIG1A,WQ0UVIAA,BLZOG7CK,PWFIRAGL,NN3FJMUV,NLBO1Z6R',
    Expands: { auc: '' },
    View: 'changeDBCh',
    SearchFrom: '资源范围：总库',
  }
  const body = new URLSearchParams({
    boolSearch: 'true',
    QueryJson: JSON.stringify(queryJson),
    pageNum: String(payload.page ?? 1),
    pageSize: '20',
    dstyle: 'listmode',
    aside: '',
    searchFrom: '资源范围：总库',
    CurPage: String(payload.page ?? 1),
  })
  const response = await fetch('https://kns.cnki.net/kns8s/brief/grid', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: body.toString(),
  })
  const html = await response.text()
  return { status: response.status, html, challenge: /安全验证|滑动验证/.test(html) }
}

/** Parse the HTML fragment the CNKI grid endpoint returns. */
export function cnkiParseGrid(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const total = Number(doc.querySelector('#countPageDiv em')?.textContent?.replace(/\D/g, '') ?? 0) || null
  const records = [...doc.querySelectorAll('tbody tr')].map(row => {
    const link = row.querySelector('td.name a')
    const cell = selector => (row.querySelector(selector)?.textContent || '').trim()
    const date = cell('td.date')
    return {
      title: (link?.getAttribute('title') || link?.textContent || '').trim(),
      url: link?.getAttribute('href') || '',
      authors: cell('td.author') ? [cell('td.author')] : [],
      venue: cell('td.source'),
      year: (date.match(/(19|20)\d{2}/) || [null])[0],
      type: cell('td.data') || cell('td:last-child'),
      access: /免费/.test(row.textContent || '') ? 'available' : null,
    }
  }).filter(record => record.title && record.url)
  return { total, records }
}

/** CNKI article page: the PDF and CAJ download links. */
export function cnkiDownloadLinks() {
  return {
    pdf: document.querySelector('#pdfDown')?.getAttribute('href') || null,
    caj: document.querySelector('#cajDown')?.getAttribute('href') || null,
  }
}

/** Wanfang (万方) result list: the SPA renders one `.normal-list` per record. */
export function wanfangSearch(rows) {
  const items = [...document.querySelectorAll('.normal-list')]
  return items.slice(0, rows).map(item => {
    const text = (item.innerText || '').replace(/\s+/g, ' ').trim()
    const title = (item.querySelector('.title')?.innerText || '').trim()
    const id = (item.querySelector('.title-id-hidden')?.innerText || '').trim()
    const authors = [...item.querySelectorAll('.authors')].map(el => (el.innerText || '').trim()).filter(Boolean)
    const type = (item.querySelector('.essay-type')?.innerText || '').trim()
    const venue = (item.querySelector('.periodical-title')?.innerText || '').trim()
    const year = (text.match(/\b(19|20)\d{2}\b/) || [null])[0]
      || (id.match(/(19|20)\d{2}(0[1-9]|1[0-2])/) || [null])[0]?.slice(0, 4)
      || null
    return {
      title,
      id,
      url: id ? `https://d.wanfangdata.com.cn/${id.replace('_', '/')}` : '',
      authors,
      venue,
      type,
      year,
      access: /有全文/.test(text) ? 'available' : null,
    }
  }).filter(record => record.title && record.url)
}

/** Wanfang detail page: the full-text download link. */
export function wanfangDownloadLink() {
  const anchor = document.querySelector('a.download[href], a.download.buttonItem')
  return anchor ? anchor.getAttribute('href') : null
}
