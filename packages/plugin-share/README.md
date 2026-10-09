# @xcwds/plugin-share

Sharing for an @xcwds app on [`@xcwds/sveltekit`](../sveltekit): a Share button in the installed
app that shares a page's link and nothing you typed, and a private share target, so other apps
can share into yours without the shared content ever reaching a server.

```ts
// xcwds.config.ts
import { defineConfig } from '@xcwds/core';
import share from '@xcwds/plugin-share';
import shell from '@xcwds/plugin-shell';

export default defineConfig({
	brand,
	// After the shell, whose header gets the button.
	plugins: [shell({ sections }), share({ target: '/utils/url-sanitizer' })]
});
```

## Options

| Option    | Default         | What it does                                                                        |
| --------- | --------------- | ----------------------------------------------------------------------------------- |
| `target`  | none            | The page that receives shares (an app path). Without it the app is no share target. |
| `exclude` | `['/settings']` | Paths (and everything under them) whose pages never show the Share button.          |

## The Share button

In the installed app there's no browser toolbar to share from, so the shell's header gets a
Share button (with `@xcwds/plugin-shell`). It shares the page's title, "Title on App" (Home:
"App: tagline") and its link: origin, base path and path only, never the query or hash, which can
hold what you typed. It opens the system share sheet, or copies the link (with a toast) where
there is none. It doesn't show in a browser tab, on excluded paths or on error pages. Exclude
private pages, such as the share target if what it shows is private.

`app.share.share({ title, text, url })` does the same from your own button.

## The share target

With `target`, the manifest gets a `share_target` (GET, `url`, `text` and `title`), so Android
lists the app in its share sheet. A share opens `target?url=…&text=…&title=…`. The service
worker answers that request itself, before it leaves the device, with a `303` to the same page
with the fields in the fragment (`#url=<joined>&shared.url=…&shared.text=…&shared.title=…`),
which browsers never send to a server. The target page reads it and clears the address:

```svelte
<script lang="ts">
	import type { Shared } from '@xcwds/plugin-share';
	import { useApp } from '@xcwds/sveltekit';
	import { onMount } from 'svelte';

	let shared = $state<Shared | null>(null);
	onMount(() => useApp().shared?.listen((value) => (shared = value)));
</script>
```

`listen` calls back now and on every later share into an open tab (Safari may only change the
hash), and replaces the address with the bare page so nothing stays in history. `joined` is
every field joined with spaces (share sheets often put the link in `text`); `url`, `text` and
`title` are the fields as sent. An iPhone Shortcut can open `target#url=<encoded link>` directly.

The first share after install can open the target before the worker controls the page (Android
may open it cold). Then the page reads the query instead and clears it the same way, but that
one request did reach the server with the query (on GitHub Pages, its logs).
