---
'@xcwds/plugin-update': minor
---

Updates on the user's terms: a new version installs and waits until Update is tapped,
`app.update` (state, `check()`, `markBusy()`, `busyReasons()` with `onBeforeReload` hooks,
`apply()`, `reload()`), other tabs reload quietly when hidden and idle or ask otherwise, and
`<UpdateBanner>`. Options: `checkEveryMs` and `askBeforeReload`.
