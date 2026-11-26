/** Page-function tests: a real headless Chrome renders fixtures, no network needed. */
import { ADAPTERS, clickByLabel, findInstitutionalEntry, readAccess, readMetadata } from '../lib/papers.js'
import { cnkiParseGrid, sdSearch, springerSearch, wanfangSearch } from '../lib/page-scripts.js'
import { openHtml } from './helpers.mjs'
import {
  articleMetaHtml,
  challengeHtml,
  ieeeDocHtml,
  institutionHtml,
  loginEntryHtml,
  paywallHtml,
  cnkiGridHtml,
  sdSearchHtml,
  wanfangResultsHtml,
  springerSearchHtml,
} from './fixtures.mjs'

const ieee = ADAPTERS.find(adapter => adapter.name === 'ieee')

export default async function run(t, browser) {
  t.section('ScienceDirect result parsing')
  const sdPage = await openHtml(browser, sdSearchHtml)
  const sdRecords = await sdPage.call(sdSearch, 10)
  await sdPage.close()
  t.equal('deduplicates by PII', sdRecords.length, 2)
  t.equal('keeps the first title', sdRecords[0].title, 'Physics-inspired prototype alignment for cross-domain RUL prediction')
  t.equal('extracts the PII', sdRecords[0].pii, 'S0263224126016970')
  t.equal('extracts the year', sdRecords[0].year, '2026')
  t.equal('marks full text as available', sdRecords[0].access, 'available')
  t.equal('builds the article url', sdRecords[1].url, 'https://www.sciencedirect.com/science/article/pii/S0379711226003590')

  t.section('Springer result parsing')
  const springerPage = await openHtml(browser, springerSearchHtml)
  const springerRecords = await springerPage.call(springerSearch, 10)
  await springerPage.close()
  t.equal('returns both cards', springerRecords.length, 2)
  t.equal('keeps the venue', springerRecords[0].venue, 'Cluster Computing')
  t.equal('extracts the year', springerRecords[0].year, '2023')
  t.equal('flags full access', springerRecords[0].access, 'available')
  t.ok('keeps the article url', springerRecords[0].url.includes('10.1007/s10586-023-04231-3'))

  t.section('IEEE metadata')
  const ieeePage = await openHtml(browser, ieeeDocHtml)
  const ieeeMeta = await ieee.metadata(ieeePage)
  await ieeePage.close()
  t.equal('reads the title', ieeeMeta.title, 'Thermal runaway analysis and model of nickel-rich lithium-ion batteries')
  t.equal('reads the year from Published in', ieeeMeta.year, '2022')
  t.deepEqual('reads the authors', ieeeMeta.authors.slice(0, 2), ['Zhaoqi Chen', 'Peng Huang'])

  t.section('Highwire metadata')
  const metaPage = await openHtml(browser, articleMetaHtml)
  const meta = await readMetadata(metaPage)
  await metaPage.close()
  t.equal('citation title', meta.title, 'Physics-inspired prototype alignment for cross-domain RUL prediction')
  t.equal('citation year', meta.year, '2026')
  t.equal('citation doi', meta.doi, '10.1016/j.measurement.2026.121988')
  t.deepEqual('citation authors', meta.authors, ['Wei Zhang', 'Li Chen'])

  t.section('access signals')
  const challengePage = await openHtml(browser, challengeHtml)
  const challenge = await readAccess(challengePage)
  await challengePage.close()
  t.ok('challenge detected', challenge.challenge)
  t.ok('challenge is not called a paywall', !challenge.paywalled)

  const institutionPage = await openHtml(browser, institutionHtml)
  const institution = await readAccess(institutionPage)
  await institutionPage.close()
  t.equal('institution name read', institution.institution, 'Tianjin University of Technology')
  t.ok('full text detected', institution.fullText)

  const paywallPage = await openHtml(browser, paywallHtml)
  const paywall = await readAccess(paywallPage)
  await paywallPage.close()
  t.ok('paywall detected', paywall.paywalled)

  t.section('CNKI grid parsing')
  const cnkiPage = await openHtml(browser, cnkiGridHtml)
  const cnki = await cnkiPage.call(cnkiParseGrid, cnkiGridHtml)
  await cnkiPage.close()
  t.equal('reads the hit count', cnki.total, 514)
  t.equal('returns both rows', cnki.records.length, 2)
  t.equal('keeps the title attribute', cnki.records[0].title, '基于微环与相变材料的光学脉冲神经网络加速器')
  t.equal('keeps the venue', cnki.records[0].venue, '中国激光')
  t.equal('extracts the year', cnki.records[0].year, '2026')
  t.equal('unwraps the author cell', cnki.records[0].authors[0], '何香玉郭鹏星卢冰')
  t.equal('flags free content', cnki.records[1].access, 'available')

  t.section('Wanfang result parsing')
  const wfPage = await openHtml(browser, wanfangResultsHtml)
  const wf = await wfPage.call(wanfangSearch, 10)
  await wfPage.close()
  t.equal('returns both records', wf.length, 2)
  t.equal('keeps the thesis title', wf[0].title, '脉冲神经网络中结构-功能相互作用的研究')
  t.equal('builds the detail url', wf[0].url, 'https://d.wanfangdata.com.cn/thesis/D04489532')
  t.equal('reads the year', wf[0].year, '2025')
  t.equal('reads the venue', wf[0].venue, '《计算机应用》')
  t.equal('reads two authors', wf[1].authors.length, 2)
  t.equal('falls back to the id year', wf[1].year, '2022')

  t.section('institutional sign-in entry')
  const loginPage = await openHtml(browser, loginEntryHtml)
  const entries = await findInstitutionalEntry(loginPage)
  t.ok('entry listed', entries.some(entry => /institutional sign in/i.test(entry.label)))
  t.ok('personal sign in ignored', !entries.some(entry => /personal/i.test(entry.label)))
  const clicked = await clickByLabel(loginPage, 'Institutional Sign In')
  await loginPage.close()
  t.ok('click by label finds the control', clicked?.clicked === true)
}
