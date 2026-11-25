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
