---
'@xcwds/plugin-update': minor
'@xcwds/plugin-changelog': minor
---

Updates hand values over to the new version (`app.update.carry()` and `handover()`), under a
`marker` key an app can keep from before @xcwds. What's new uses it to know what the old version
had: entries newer than that are new, and a fresh install neither badges nor saves anything.
