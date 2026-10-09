---
'@xcwds/testing': minor
---

`buildTestWorker()` runs the real service worker runtime, default strategy included: pass the
`build`, `files`, `prerendered` and `assets` lists to precache, dispatch `fetch`, `install`,
`activate` and `message` events, and read `skippedWaiting`. A test that throws after an error
was reported to `onError` now fails with that error.
