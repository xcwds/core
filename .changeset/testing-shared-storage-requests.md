---
'@xcwds/testing': minor
---

A test app's shared storage is now `sharedStorage` (was `shared`), so plugins can decorate
`app.shared`. `serveStatic()` and `serveDeployment()` list the `requests` they received.
