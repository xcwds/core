/**
 * What `<App>` does: provides the app as context, boots it in the browser after mount, and
 * turns SvelteKit's navigation and page-visibility events into runtime hooks (RFC 0001,
 * decision 7).
 */
import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
import type { App, Route } from '@xcwds/core';
import { getContext, onMount, setContext } from 'svelte';
import { data } from 'virtual:xcwds/client';
import { stripBase } from './routes.js';
import { getApp, loadApp } from './runtime.svelte.js';
import { settings } from './settings.svelte.js';

const KEY = Symbol.for('xcwds.app');

/** Apps whose `onBoot` hooks have run (a remounted `<App>` doesn't boot them again). */
const booted = new WeakSet<App>();

/**
 * The app, for components and plugin code. Inside `<App>` it comes from context (so tests can
 * provide another one); elsewhere it is the page's app.
 */
export function useApp(): App {
	try {
		return getContext<App | undefined>(KEY) ?? getApp();
	} catch {
		// Called outside component initialisation.
		return getApp();
	}
}

/** The route hooks see: a path without the base path, or null outside the app. */
function route(url: URL): Route | null {
	const path = stripBase(url.pathname, data.base);
	return path === null ? null : { path, url };
}

/** Sets up the app for `<App>`. Call during component initialisation. */
export function startApp(): void {
	const app = getApp();
	setContext(KEY, app);
	/** The booted app (null if it failed), once `<App>` has mounted. */
	let settle!: (app: App | null) => void;
	const ready = new Promise<App | null>((resolve) => (settle = resolve));
	/** The URL of a navigation the hooks already allowed, so it isn't checked twice. */
	let allowed: string | null = null;
	let active = true;

	beforeNavigate((nav) => {
		if (!nav.to || nav.willUnload || nav.type === 'leave') return;
		if (allowed === nav.to.url.href) {
			allowed = null;
			return;
		}
		const to = route(nav.to.url);
		if (!to || app.hooks.plugins('onNavigate', { path: to.path }).length === 0) return;
		// Hooks may be async, so hold the navigation and repeat it once they allow it.
		nav.cancel();
		const from = nav.from ? route(nav.from.url) : null;
		const target = nav.to.url;
		void app.hooks.first('onNavigate', [to, from], { path: to.path }).then((result) => {
			if (result === false || !active) return;
			const url = typeof result === 'string' ? new URL(data.base + result, target) : target;
			allowed = url.href;
			// The URL already has the base path: it is the original target or `base + result`.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			return goto(url, { replaceState: nav.type === 'popstate' });
		});
	});

	afterNavigate((nav) => {
		const to = nav.to && route(nav.to.url);
		if (to) void ready.then((a) => a?.hooks.run('afterNavigate', [to], { path: to.path }));
	});

	onMount(() => {
		const stops: (() => void)[] = [];
		void loadApp()
			.then(async (loaded) => {
				if (!active) return null;
				stops.push(settings.attach(loaded), loaded.storage.startSync(window));
				if (!booted.has(loaded)) {
					booted.add(loaded);
					await loaded.hooks.run('onBoot', []);
				}
				await loaded.ready();
				return loaded;
			})
			.catch((error: unknown) => {
				// A plugin failed to load: the page still works, without plugins.
				console.error('[xcwds]', error);
				return null;
			})
			.then(settle);
		const onVisibility = () =>
			void ready.then((a) =>
				a?.hooks.run(document.visibilityState === 'hidden' ? 'onHidden' : 'onVisible', [])
			);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			active = false;
			document.removeEventListener('visibilitychange', onVisibility);
			for (const stop of stops) stop();
		};
	});
}
