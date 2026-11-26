# Changelog

## 0.5.0

- `wanfang` adapter: search through the result page, download through the detail page link. Search is
  verified live; the download reports an exhausted institutional balance explicitly instead of timing
  out, which is the state this campus is in today.
- CNKI: network-first articles without a PDF now fail with a precise reason.

## 0.4.0

- `cnki` adapter: search through CNKI's own grid endpoint and download through the article page's
  PDF button (verified: 1.7 MB / 10 pages). Network-first publications without a PDF are reported.
- `npm run capture`: dump DOM, screenshot, and XHR request/response bodies for reverse-engineering a
  database offline.
- Challenge detection now requires an actual verification page (URL or title) instead of matching
  hidden text that CNKI embeds in article pages.
- Tests guard that no page function calls another page function — the failure mode behind two real
  bugs this round.

## 0.3.3

- `papers_zotero`: write the session's records into the local Zotero library through its local API,
  with a one-time approval in Zotero and the key kept outside the repository.
- README screenshot of the subscription being recognized, plus a local-Zotero section.

## 0.3.2

- Repository, homepage and issue tracker metadata; English and Chinese README with badges and a demo.
- First public release: GitHub repository, badges, 18 topics.
- 18 GitHub topics so the plugin is discoverable from searches for DSH, CARSI, IEEE, Zotero and
  literature review.

## 0.3.0

- Multi-database search: `papers_search` accepts `publishers` and merges results by DOI (or title),
  recording every database that returned a record.
- `papers_export` writes the session's records as BibTeX or RIS.
- Browser operations are serialized, so concurrent tool calls no longer fight over the tab.
- Transient network and 5xx failures retry with exponential backoff; paywalls never retry.
- Download cap is counted per agent session instead of per process.
- Page scripts moved to `lib/page-scripts.js` and injected with `Page.call`, removing the template
  string escaping that broke earlier builds.
- Naming and export logic extracted into `lib/naming.js` and `lib/export.js` with unit tests.
- Offline test suite: 123 checks covering naming, PDF inspection, adapters, tool schemas, page
  parsing against fixtures, and citation export.

## 0.2.0

- ScienceDirect adapter (search + signed-asset download).
- Auto naming `year-firstAuthor-title.pdf` from the preceding search record.
- Audit log `carsi-audit.jsonl`, request pacing, per-process download cap.
- Human-verification flow: desktop notification, window raise, and a 90-second wait.
- English and Chinese detail documents and plugin metadata.

## 0.1.0

- Initial bundle: CDP-driven dedicated Chrome, IEEE Xplore and Springer adapters,
  `papers_status` / `papers_open` / `papers_eval`.
