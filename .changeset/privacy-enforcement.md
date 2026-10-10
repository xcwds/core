---
'@xcwds/core': minor
'@xcwds/sveltekit': minor
'@xcwds/plugin-settings': minor
---

Never phone home, enforced: plugins' `network` metadata is checked when they load
(`XCWDS_ERR_PLUGIN_META`), the build fails on any origin in the built site that no plugin
declares and `privacy.allowOrigins` doesn't list (naming the plugin), the CSP allows only the
declared origins, `privacy.allowOrigins` also takes `wss:` origins, development builds warn when
a query string carries saved data (`savedDataInQuery`), and the settings page has a Privacy
section listing what each plugin contacts.
