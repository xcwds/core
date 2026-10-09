---
'@xcwds/plugin-share': minor
---

Sharing: a Share button in the installed app's header that shares a page's title and link (never
its query or hash) or copies it, and a GET share target whose service worker moves shared
content from the query to the fragment before it leaves the device, with `app.shared.listen()`
for the target page.
