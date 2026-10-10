---
'@xcwds/sveltekit': patch
'@xcwds/plugin-timers': patch
---

`<html data-hydrated>` is set once the app has booted, so tests that wait for it never act before
plugins follow the browser's events. `<TimerAlert>` no longer re-renders itself in a loop while a
timer rings, and takes an `openLabel` for its Open link.
