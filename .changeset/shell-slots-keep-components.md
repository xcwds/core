---
'@xcwds/plugin-shell': patch
---

Home blocks and header actions no longer re-create every component whenever a plugin adds or
removes one, so their state (and anything they do on mount) survives.
