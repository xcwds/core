---
'@xcwds/sveltekit': patch
---

`<App>` marks `<html data-hydrated>` once mounted. `@xcwds/sveltekit/routes` exports the
framework-free core `<App>`, the service worker and `@xcwds/testing` share: the route
registry, `setupApp`, `routeOf`, `askGuards`, `decide` and `workerPath`.
