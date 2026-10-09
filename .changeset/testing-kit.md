---
'@xcwds/testing': minor
---

The test kit. For Vitest: `buildTestApp()` boots an app's plugins (functions, pairs, or
descriptors loaded from their packages' entries, with their build routes) on in-memory storage,
with a fake wall clock, simulated tabs that get each other's `storage` events, and `navigate()`
running the route hooks; `buildTestWorker()` runs worker hooks against a `Request` with an
in-memory cache. For Playwright (`@xcwds/testing/playwright`): `gotoHydrated`,
`auditTapTargets`, a GitHub Pages-like static server, `serveDeployment()` for fake new versions,
service-worker helpers and the `xcwdsPlaywright()` config preset.
