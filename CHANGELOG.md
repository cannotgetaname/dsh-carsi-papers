# Changelog

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
