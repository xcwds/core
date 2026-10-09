---
'@xcwds/sveltekit': patch
---

`brand` reads the config lazily, so a plugin's client entry can import components that use it.
