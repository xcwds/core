# @xcwds/plugin-offline

Offline support for an @xcwds app on [`@xcwds/sveltekit`](../sveltekit). The integration's
service worker already precaches the build and serves it from this version's cache first; this
plugin tunes that strategy, keeps pages and files that weren't precached once they load, and
tells the page when the browser is offline.

```ts
// xcwds.config.ts
import { defineConfig } from '@xcwds/core';
import offline from '@xcwds/plugin-offline';

export default defineConfig({
	brand,
	plugins: [offline({ exclude: ['/videos/**'] })]
});
```

```svelte
<!-- src/routes/+layout.svelte, inside <App> -->
<script lang="ts">
	import OfflineNotice from '@xcwds/plugin-offline/OfflineNotice.svelte';
</script>

<OfflineNotice label="Offline · everything still works" />
```

## Options

All paths are app paths, without the base path.

| Option           | Default       | What it does                                                                                                                       |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `precache`       | `[]`          | Extra paths to precache on install, beside everything the build emits.                                                             |
| `exclude`        | `[]`          | Globs never precached or cached at runtime (`*` within a segment, `**` across segments). They still load from the network.         |
| `fallback`       | `'/404.html'` | The page offline navigations get when nothing is cached for them. The default boots the app, which renders its error page.         |
| `runtimeCaching` | `true`        | Keep same-origin `200` responses without a query string that weren't precached, so they work offline later (this version's cache). |

## In the page

`app.network` holds the browser's online state: `online` and `subscribe(listener)`, which calls
the listener now and on every change and returns a function that stops it. `<OfflineNotice>`
renders it as a `role="status"` notice; restyle it with `--xcwds-offline-bg` and
`--xcwds-offline-fg`, or render your own from `app.network`.

## Testing

`buildTestWorker` from `@xcwds/testing` runs the real worker with this plugin; pass the build
lists to precache and a `network` to answer what isn't cached. The e2e tests in
[`examples/minimal`](../../examples/minimal/e2e/plugins.test.ts) load the app once, go offline,
and check every page, an unknown URL and the notice.
