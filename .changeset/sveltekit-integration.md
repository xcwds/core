---
'@xcwds/sveltekit': minor
---

The SvelteKit integration: `withXcwds()` for svelte.config.js (config loading, build hooks,
adapter-static with a 404.html fallback, prerender entries, a hash-mode CSP), the `xcwds()` Vite
plugin (plugin client entries, manifest and icons), `handle` and `init` hooks (pre-paint script
and head tags), a service worker runtime with baseline offline support, `<App>`, `useApp()`,
Svelte 5 `persist()` and reactive `settings`, and a route registry. Honours `paths.base`.
