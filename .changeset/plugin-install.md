---
'@xcwds/plugin-install': minor
---

Install support: an early `beforeinstallprompt` caught by the head script, `app.install`
(state, `subscribe()`, `prompt()`), platform checks (`isIos()`, `isStandalone()`) and
`<InstallCard>` with an Install button or Add to Home Screen steps, hidden once installed.
