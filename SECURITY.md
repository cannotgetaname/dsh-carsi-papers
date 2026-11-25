# Security

## What the plugin can do

`papers_eval` runs arbitrary JavaScript in the research browser's active page, with that browser's
cookies. Treat it as a debugging tool for unadapted databases, not a sandbox: anything the signed-in
session can reach, that tool can reach too. Use `papers_search` / `papers_fetch` for normal work.

`papers_login` opens a publisher's institutional sign-in entry and hands the window to the user. It
never reads, types, stores, or replays credentials.

## Credentials and sessions

- The research browser uses its own profile (`$DSH_HOME/papers-browser`), separate from everyday
  browsing.
- Cookies are never exported, logged, or copied into another profile.
- The audit log records database names, queries, DOIs, file paths, and sizes — not cookies or tokens.

## Access boundaries

The plugin only fetches what the current session is already entitled to. Paywalls and robot checks are
reported as state; the plugin does not solve challenges, spoof fingerprints, or proxy around a
publisher. Requests are paced, and a session stops after `maxDownloads` files.

## Reporting

Open an issue describing the affected tool, the publisher, and the session state (institution name,
paywall or challenge) without including cookies or account details.
