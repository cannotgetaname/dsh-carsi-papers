/**
 * Static HTML fixtures shaped like the publisher pages the adapters parse.
 * They exist so the page functions can be tested offline, without hitting a site.
 */

export const sdSearchHtml = `<!doctype html><meta charset="utf-8"><title>search</title>
<ul class="results">
  <li>
    <a href="/science/article/pii/S0263224126016970">Physics-inspired prototype alignment for cross-domain RUL prediction</a>
    <div>Measurement 2026</div>
    <a href="/science/article/pii/S0263224126016970/pdfft?pid=1-s2.0-S0263224126016970-main.pdf">View PDF</a>
  </li>
  <li>
    <a href="/science/article/pii/S0379711226003590">Experimental study on thermal runaway</a>
    <div>Journal of Power Sources 2027</div>
  </li>
  <li>
    <a href="/science/article/pii/S0263224126016970/pdfft?pid=dup">View PDF</a>
  </li>
</ul>`

export const springerSearchHtml = `<!doctype html><meta charset="utf-8"><title>search</title>
<ol>
  <li class="app-card-open">
    <a data-test="title" href="https://link.springer.com/article/10.1007/s10586-023-04231-3">A performance evaluation model for users' satisfaction</a>
    <span data-test="journal-title">Cluster Computing</span>
    <span data-test="authors">A. Author, B. Author</span>
    <span>Published 2023</span>
    <span>Full access</span>
  </li>
  <li class="app-card-open">
    <a data-test="title" href="https://link.springer.com/article/10.1007/s00134-000-0000-0">Another article</a>
    <span data-test="journal-title">Intensive Care Medicine</span>
    <span>2019</span>
  </li>
</ol>`

export const ieeeDocHtml = `<!doctype html><meta charset="utf-8"><title>Article | IEEE Xplore</title>
<h1 class="document-title">Thermal runaway analysis and model of nickel-rich lithium-ion batteries</h1>
<div id="authors">
  <div class="authors-info"><a>Zhaoqi Chen</a><a>Peng Huang</a><a>Qitian Pang</a></div>
</div>
<div>Published in: 2022 6th CAA International Conference on Vehicular Control and Intelligence (CVCI)</div>
<div>Date of Conference: 28-30 October 2022</div>`

export const articleMetaHtml = `<!doctype html><meta charset="utf-8"><title>Article</title>
<meta name="citation_title" content="Physics-inspired prototype alignment for cross-domain RUL prediction">
<meta name="citation_journal_title" content="Measurement">
<meta name="citation_publication_date" content="2026/07/07">
<meta name="citation_doi" content="10.1016/j.measurement.2026.121988">
<meta name="citation_author" content="Wei Zhang">
<meta name="citation_author" content="Li Chen">`

export const challengeHtml = `<!doctype html><meta charset="utf-8"><title>Just a moment...</title>
<body>Are you a robot? Please confirm you are a human by completing the captcha challenge below.
Reference number: abc123 IP Address: 10.0.0.1</body>`

export const institutionHtml = `<!doctype html><meta charset="utf-8"><title>Article</title>
<body>Access provided by: Tianjin University of Technology
Full text access. <a href="/pdf">View PDF</a></body>`

export const paywallHtml = `<!doctype html><meta charset="utf-8"><title>Article</title>
<body>Buy article PDF. Get access to the full version. Purchase this article.</body>`

export const loginEntryHtml = `<!doctype html><meta charset="utf-8"><title>Sign in</title>
<body>
  <a href="/institution/login?entityID=https://idp.example.edu/idp/shibboleth">Institutional Sign In</a>
  <button>Personal Sign In</button>
</body>`

export const cnkiGridHtml = `<div id="briefBox">
  <div id="countPageDiv"><span class="pagerTitleCell"><span>共找到</span><em>514</em><span>条结果</span></span></div>
  <table class="result-table-list"><tbody>
    <tr>
      <td class="seq">1</td>
      <td class="name"><a title="基于微环与相变材料的光学脉冲神经网络加速器" href="https://kns.cnki.net/kcms2/article/abstract?v=AAA">基于微环与相变材料的光学脉冲神经网络加速器</a></td>
      <td class="author">何香玉郭鹏星卢冰</td>
      <td class="source">中国激光</td>
      <td class="date">2026-09-10</td>
      <td class="data">期刊</td>
    </tr>
    <tr>
      <td class="seq">2</td>
      <td class="name"><a title="网络首发论文" href="https://kns.cnki.net/kcms2/article/abstract?v=BBB">网络首发论文</a></td>
      <td class="author">张三</td>
      <td class="source">计算机应用</td>
      <td class="date">2026-10-14 10:40</td>
      <td class="data">期刊免费</td>
    </tr>
  </tbody></table>
</div>`

export const wanfangResultsHtml = `<!doctype html><meta charset="utf-8"><div class="detail-list-wrap">
  <div class="normal-list periodical-list">
    <div class="title-area"><div class="ajust">
      <span class="index">1.</span>
      <span class="title">脉冲神经网络中结构-功能相互作用的研究</span>
      <span class="title-id-hidden">thesis_D04489532</span>
    </div></div>
    <div class="author-area"><span class="essay-type">学位论文</span><span class="authors">张三</span></div>
    <div class="source-area"><span class="periodical-title">《计算机应用》</span><span>2025年2期</span><span>有全文</span></div>
  </div>
  <div class="normal-list periodical-list">
    <div class="title-area"><div class="ajust">
      <span class="index">2.</span>
      <span class="title">基于微环与相变材料的光学脉冲神经网络加速器</span>
      <span class="title-id-hidden">periodical_zdhxb202202024</span>
    </div></div>
    <div class="author-area"><span class="essay-type">期刊论文</span><span class="authors">李四</span><span class="authors">王五</span></div>
    <div class="source-area"><span class="periodical-title">《自动化学报》</span><span>2022年3期</span></div>
  </div>
</div>`
