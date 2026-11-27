# Changelog

## 0.8.2

- Docs and discoverability only, no behaviour change. The Chinese README listed three databases and
  seven tools; it now covers all five adapters (CNKI and Wanfang included), all fifteen tools, and the
  reference-audit and campus-check commands, so searching for 知网 / 万方 finds the plugin.
- `package.json` keywords gain the database names, GB/T 7714 and reference auditing.

## 0.8.1

- Fix: `ref_audit` / `ref_format` failed on any reference list whose entries lacked a journal or
  year. The parsers emitted `venue: undefined`, and DSH rejects a tool value that does not survive a
  JSON round trip, so the whole call came back as "value is not lossless JSON". Parsers now use
  `null`, and `guard` normalizes every tool value to plain JSON as a second line of defence.
- Crossref requests identify as `dsh-carsi-papers`, not the retired `dsh-ref-doctor`.
- 242 offline checks.

## 0.8.0

- Reference auditing folded in: `ref_audit` (parse .bib / LaTeX / numbered lists, verify each entry
  against Crossref) and `ref_format` (GB/T 7714 output with Crossref backfill).
- Campus checks folded in: `campus_status` / `campus_mark`. The campus NAT answers with several
  egress addresses (111.160.x and 123.150.x observed), so the verdict uses the pool of recorded
  prefixes rather than one address.
- The BibTeX parser now balances braces, so single-line and nested-brace entries parse.
- 191 offline checks.

## 0.7.0

- `papers_enrich`: fills missing authors, venue, and year through Crossref by DOI — verified live on a
  ScienceDirect record that arrived with no authors (six were recovered).
- `papers_export` gains **GB/T 7714**, the numbered style Chinese theses use.
- Ideas borrowed from sibling plugins: GB/T 7714 from `dsh-cite`, Crossref verification from
  `dsh-reference-checker`, Crossref/OpenAlex enrichment from `dsh-lit-harvest`.

## 0.6.0

- `papers_doctor`: one call reports the whole stack — browser, profile, download directory, Node
  version, Zotero local API and key, and reachability of all five databases (a 403/418 still counts as
  reachable, because those are bot walls in front of a live site).
- `lib/doctor.js` keeps the checks testable; the summary format has unit coverage.

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
