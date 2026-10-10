# @xcwds/plugin-update

App updates on the user's terms, for an @xcwds app on [`@xcwds/sveltekit`](../sveltekit). A new
version installs in the background and waits; the page offers it, and it takes over only when
the user taps Update. Until then a relaunch keeps the old version, since precached files come
from the old version's cache.

```ts
// xcwds.config.ts
import { defineConfig } from '@xcwds/core';
import offline from '@xcwds/plugin-offline';
import update from '@xcwds/plugin-update';

export default defineConfig({ brand, plugins: [offline(), update({ askBeforeReload: true })] });
```

```svelte
<!-- src/routes/+layout.svelte, inside <App> -->
<script lang="ts">
	import UpdateBanner from '@xcwds/plugin-update/UpdateBanner.svelte';
</script>

<UpdateBanner />
```

## Options

| Option            | Default              | What it does                                                                                                                                                    |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkEveryMs`    | `3600000`            | How often an open page looks for a new version (`0` turns it off). It also looks on launch, when the app comes back into view and when the browser goes online. |
| `askBeforeReload` | `true`               | While something is busy, the banner asks before Update or Reload goes ahead.                                                                                    |
| `marker`          | `xcwds:just-updated` | The `sessionStorage` key the update hands over in (see below). Set it to the key an app used before moving onto @xcwds.                                         |

## Busy work

A reload throws away what a page holds in memory: a running timer, an unsaved form. Say so in
either of two ways, and the banner shows "Finish your … first." and asks before reloading:

```ts
// State a component already holds:
onMount(() => useApp().update?.markBusy('timer', () => running));
// Or a hook in any client plugin:
app.addHook('onBeforeReload', () => (running ? 'timer' : undefined));
```

## Other tabs

When one tab applies the update, the new worker takes over every tab. A hidden tab with nothing
busy reloads quietly; any other tab shows "Updated in another tab" with a Reload button.

## Handing over to the new version

Update leaves a marker in `sessionStorage` for the reloaded page: `app.update.state.justUpdated`
is true on that first load. Plugins can carry values across with it: `app.update.carry(name, () =>
value)` adds one to the marker when it is written (the old version's code runs it), and
`app.update.handover()` reads them in the new version (`null` when this load isn't an update;
`{}` for a marker without values, such as one an app wrote before @xcwds).
`@xcwds/plugin-changelog` carries the newest entry the old version had, so What's new knows what's
new even on a device that never opened it.

## `app.update`

`state` (`available`, `reloadNeeded`, and `justUpdated` on the first load after an update, for
what's-new notes), `subscribe(listener)`, `check()`, `busyReasons()`, `markBusy(name, isBusy)`,
`carry(name, value)`, `handover()`,
`apply()` (what Update does) and `reload()` (what Reload does). To change how the banner looks,
pass `text` to `<UpdateBanner>`, set `--xcwds-update-bg`, `--xcwds-update-fg` and
`--xcwds-update-accent`, or render your own from `app.update`.

The worker entry answers the page's `{ type: 'SKIP_WAITING' }` message with
`app.worker.skipWaiting()`; nothing else makes a new version take over.
