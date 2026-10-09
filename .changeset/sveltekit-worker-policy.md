---
'@xcwds/sveltekit': minor
---

The service worker runtime decorates `app.worker` (version, base, cache name, `skipWaiting()`
and a cache `policy` that worker plugins adjust: extra precache paths, exclusions, the offline
fallback page, runtime caching), and exports its event and scope types.
