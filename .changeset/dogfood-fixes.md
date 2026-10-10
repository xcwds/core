---
'@xcwds/sveltekit': patch
'@xcwds/plugin-timers': patch
---

`<html data-hydrated>` is set once the app has booted, so tests that wait for it never act before
plugins follow the browser's events. `<TimerAlert>` no longer re-renders itself in a loop while a
timer rings, and takes an `openLabel` for its Open link. The config also loads in a fresh checkout, before `svelte-kit sync` has written the
`.svelte-kit/tsconfig.json` an app's tsconfig extends.
