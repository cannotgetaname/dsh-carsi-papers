# Contributing

## Tests

```sh
npm test          # unit + page-function tests (headless Chrome, no network)
npm run test:unit # unit tests only, no browser needed
npm run test:live # opt-in: real searches and downloads against subscribed publishers
```

The offline suite uses fixtures in `test/fixtures.mjs` rendered in a headless Chrome, so adapter
parsing can be tested without touching a publisher.

## Adding a database

1. Add the page functions it needs to `lib/page-scripts.js` (self-contained, no imports, no closures).
2. Add an adapter object to `ADAPTERS` in `lib/papers.js`:

```js
{
  name: 'acm',
  label: 'ACM Digital Library',
  origin: 'https://dl.acm.org/',
  match: url => /dl\.acm\.org/.test(url),
  articleUrl: record => ...,
  metadata: page => page.call(citationMeta),
  async search(page, query, options) { ... },
  async pdf(page, record) { ... },
}
```

3. Add a fixture that mirrors the result page and extend `test/page-scripts.test.mjs`.
4. Document the access mechanism (IP, CARSI, or account) in the README table.

## Style

- No runtime dependencies: the browser client is plain CDP over the global `WebSocket`.
- Keep page functions self-contained; `Page.call(fn, arg)` serializes them into the page.
- Throw `RetryableError` only for genuinely transient failures (network, 5xx).
