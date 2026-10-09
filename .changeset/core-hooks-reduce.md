---
'@xcwds/core': minor
---

`app.hooks.reduce()` passes a value through every hook in order, each able to replace it (for
`onConfig` and `onManifest`), and `app.hooks.firstNow()` is `first()` answering synchronously
while the hooks do (for navigation guards).
