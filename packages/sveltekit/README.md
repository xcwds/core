# @xcwds/sveltekit

Binds the [@xcwds](https://github.com/xcwds/core) kernel to SvelteKit: config loading, plugin
entries for the page and the service worker, the pre-paint script, the manifest and icons, and
Svelte 5 helpers. Design: [RFC 0001](../../docs/rfc/0001-architecture.md), decisions 1 to 4 and 9.

## Setup

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { xcwds } from '@xcwds/sveltekit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [xcwds(), sveltekit()] });
```

```js
// svelte.config.js: a Vite plugin can't set the adapter or CSP, so a helper does
import { withXcwds } from '@xcwds/sveltekit/config';

export default await withXcwds({ kit: { paths: { base: '' } } });
```

```ts
// src/hooks.server.ts
export { handle, init } from '@xcwds/sveltekit/hooks';
// src/hooks.client.ts
export { init } from '@xcwds/sveltekit/hooks';
// src/service-worker.ts
import '../.xcwds/worker.js';
// src/routes/+layout.ts
export const prerender = true;
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import { App } from '@xcwds/sveltekit';
	let { children } = $props();
</script>

<App>{@render children()}</App>
```

`src/app.html` needs `%xcwds.head%` right after `%sveltekit.head%` (see decision 4). Add
`.xcwds` to `.gitignore` if your tools don't read the one generated inside it.

## What each part does

- **`withXcwds(svelteConfig, { adapter })`** loads `xcwds.config.ts` (or `.js`) with Vite's
  `runnerImport`, validates it, loads each plugin's `build` export and runs its build hooks
  (`onConfig`, `onManifest`, `onHead`, `onWorker`, `onPrerender`), and writes `.xcwds/worker.js`.
  It sets adapter-static with a `404.html` fallback (unless `kit.adapter` is set), prerender
  `entries` for every registered route and `onPrerender` path, and a hash-mode CSP that allows
  only the app's origin (plus `privacy.allowOrigins` for `connect-src`); your `kit.csp`
  directives are added to it.
- **`xcwds()`** serves `virtual:xcwds/client` (each plugin's `./client` entry, routes and head
  data) to the page bundle, and emits `manifest.webmanifest` and the icons rendered from
  `brand.icon` (with `@xcwds/core/build`, which needs `@resvg/resvg-js`).
- **`handle`** puts the manifest, icon and iOS tags and one pre-paint script (plugins' `onHead`
  snippets and settings' `prePaint` fields) in place of `%xcwds.head%`, and adds the script's
  hash to the page's CSP. **`init`** loads the plugins before the first render, so pages render
  and hydrate with their decorators, routes and settings fields.
- **`.xcwds/worker.js`** starts the worker from `@xcwds/sveltekit/worker`: plugins' `onFetch`
  hooks answer first; everything else is precached on install and served from this version's
  cache first, then the network, then `404.html` for offline navigations. A new version waits
  until the old one's tabs have closed.
- **`<App>`** provides the app, boots it after mount (`onBoot`, then `onReady`) and turns
  navigations into `onNavigate` (which can redirect or cancel) and `afterNavigate`, and page
  visibility into `onHidden` / `onVisible`. Vite HMR closes the old app.

Everything that builds a URL honours `paths.base`. Route paths, hook paths and the route
registry never include it.

## In components

```ts
import { persist, routeInfo, settings, useApp } from '@xcwds/sveltekit';

const app = useApp(); // the kernel app, with every plugin's decorators
persist(
	app.timers.presets,
	() => presets,
	(v) => (presets = v)
); // loads after mount, saves on change
settings.current.theme; // defaults until `settings.ready`, then the saved values, reactively
routeInfo(page.url.pathname); // { title, emoji, parent, width } of the current page
```

## Plugin packages

A plugin package exports up to three entries, each a kernel plugin:

```js
// index.js: the config factory, and build hooks run in Node
export default descriptor('xcwds-plugin-hello');
export const build = definePlugin((app, options) => {
	app.route({ path: '/', title: 'Hello', emoji: '👋', parent: '/' }); // under its `prefix`
	app.addHook('onHead', () => 'document.documentElement.dataset.hello="1";');
});
// client.js (the page, and Node at prerender) and worker.js (the service worker)
export default definePlugin((app, options) => { ... });
```

Its pages are thin route files in the app that render a component the plugin exports
(decision 2). [`examples/plugin-hello`](../../examples/plugin-hello) has all three.

## Dev, preview and static hosting

- `vite build` writes a static site; serve it like GitHub Pages does (unknown paths get
  `404.html`, which boots the app and shows `+error.svelte`).
- `vite dev` renders pages on request: the CSP is a header, the manifest and icons come from
  memory, and there is no `404.html`, so offline not-found pages only work in a build. SvelteKit
  registers the service worker in dev too, with empty precache lists.
- `vite preview` serves the build output but renders unknown paths on the server instead of
  serving `404.html`.
