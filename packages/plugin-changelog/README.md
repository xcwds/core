# @xcwds/plugin-changelog

What's new for an @xcwds app on [`@xcwds/sveltekit`](../sveltekit): release notes on the
settings page, a New badge on the ones the user hasn't seen yet, and a toast after an update
that links to them.

```ts
// src/lib/changelog.ts: one entry per change people will notice, newest first
import type { ChangelogEntry } from '@xcwds/plugin-changelog';

export const changelog: ChangelogEntry[] = [
	{ id: 2, date: '2026-10-09', items: ['Timers keep ringing on every page.'] },
	{ id: 1, date: '2026-10-08', items: ['The first version.'] }
];
```

```ts
// xcwds.config.ts
import { defineConfig } from '@xcwds/core';
import changelog from '@xcwds/plugin-changelog';
import settings from '@xcwds/plugin-settings';
import shell from '@xcwds/plugin-shell';
import update from '@xcwds/plugin-update';
import { changelog as entries } from './src/lib/changelog.js';

export default defineConfig({
	brand,
	plugins: [shell({ sections }), settings(), update(), changelog({ entries })]
});
```

```css
/* src/app.css, after Tailwind and the shell's styles */
@import '@xcwds/plugin-changelog/styles.css';
```

## Options

- `entries`: `{ id, date, items }` newest first, with whole-number ids that grow (checked when
  the config loads). Keep them in their own module, as above: the config is plain data, so it
  takes the entries rather than a path to them.
- `show`: how many entries What's new lists. Defaults to 10.
- `storageKey`: where the newest entry seen is saved. Defaults to `app:changelog:seen`; set it
  to keep a key an app already uses.

## What it does

- A fresh install (or cleared data) saves the newest id when the app first starts, so it
  badges nothing. Later versions badge entries with a higher id until What's new shows them.
- After an update (the marker from `@xcwds/plugin-update`) with entries the user hasn't seen,
  `app.toast` (from `@xcwds/plugin-shell`) says "App updated." with a link to What's new.
- With `@xcwds/plugin-settings`, What's new is a section of the settings page (after About), at
  `#whats-new`. Without it, place `<WhatsNew />` from `@xcwds/plugin-changelog/WhatsNew.svelte`
  inside `<App>` yourself.
- `app.changelog` has `entries`, `latest`, `seen()`, `markSeen()` and `subscribe(listener)`.
