# @xcwds/plugin-theme

Light, dark and system colour schemes for an @xcwds app on [`@xcwds/sveltekit`](../sveltekit),
applied before first paint, so a dark theme never flashes light.

```ts
// xcwds.config.ts
import { defineConfig } from '@xcwds/core';
import theme from '@xcwds/plugin-theme';

export default defineConfig({
	brand: { name: 'My app', themeColor: { light: '#dbeafe', dark: '#030712' } },
	plugins: [theme()]
});
```

```svelte
<!-- Anywhere inside <App>, e.g. a settings page -->
<script lang="ts">
	import ThemePicker from '@xcwds/plugin-theme/ThemePicker.svelte';
</script>

<ThemePicker />
```

## What it does

- Adds the `theme` setting (`'system' | 'light' | 'dark'`, section `appearance`). Option
  `default` sets it until the user picks one (default `'system'`).
- Before first paint, the pre-paint script sets `data-color-scheme="light|dark"` and
  `color-scheme` on `<html>`, and the `<meta name="theme-color">` to `brand.themeColor.light`
  or `.dark`. The build hands those colours to the page as `window.__xcwdsThemeColor`.
- In the page it applies the theme again when the setting changes (in any tab) and, on
  `system`, when the OS switches scheme. `app.theme` has the `scheme` showing now and
  `subscribe(listener)`.

## Styling

Key dark styles on `data-color-scheme`, never `data-theme` (UI kits such as Skeleton own it):

```css
html[data-color-scheme='dark'] {
	background: #030712;
}
```

With Tailwind v4, import the `dark` variant after Tailwind itself, so `dark:` follows the app's
theme instead of only the OS:

```css
@import 'tailwindcss';
@import '@xcwds/plugin-theme/tailwind.css';
```

`<ThemePicker>` takes `legend` and `labels` (`{ system, light, dark }`) for other languages.
