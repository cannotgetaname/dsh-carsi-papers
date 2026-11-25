# CARSI literature browser

Subscribed literature access for DSH through a dedicated Chrome profile, so the agent works inside
the campus institutional session instead of collecting open-access copies.

## Functionality

- `papers_search` queries IEEE Xplore, Springer Nature Link, or ScienceDirect and returns normalized
  records with an access state per item.
- `papers_fetch` downloads one PDF through the same session, verifies the `%PDF-` signature, counts
  pages with `pdfinfo`, writes `year-firstAuthor-title.pdf` under `downloadDir`, and appends a line to
  `carsi-audit.jsonl`.
- `papers_access` reports whether a publisher recognizes the subscription, shows a paywall, or is
  serving a robot challenge.
- `papers_login` opens the institutional sign-in entry and hands the window to the user; credentials
  are never typed, stored, or replayed.
- `papers_status`, `papers_open`, and `papers_eval` expose the browser itself: state, navigation, and
  page-context JavaScript for databases without an adapter.

## Usage

1. Call `papers_status` to see whether the research browser is running.
2. Call `papers_search` with a query and a publisher.
3. Call `papers_fetch` with the record id (IEEE article number, ScienceDirect PII, or article URL).
4. If `papers_access` reports a sign-in or a challenge, complete it in the browser window that comes
   forward; the waiting call continues on its own within 90 seconds.

## Limitations

- Sessions live in one dedicated profile, so each publisher may need one manual sign-in, repeated when
  the publisher expires the session.
- Robot checks are completed by the user; the plugin only notifies and waits.
- IEEE exposes no Highwire citation tags, so file naming depends on the record cached from the search.
- Every request is paced, and a process stops after `maxDownloads` files (30 by default).
