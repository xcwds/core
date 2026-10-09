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
import { appLoaded, getApp, loadApp } from './runtime.svelte.js';
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

/** Redirects one navigation may go through before it is stopped (a loop between guards). */
const MAX_REDIRECTS = 5;

/** Sets up the app for `<App>`. Call during component initialisation. */
export function startApp(): void {
	const app = getApp();
	setContext(KEY, app);
	/** The booted app (null if it failed), once `<App>` has mounted. */
	let settle!: (app: App | null) => void;
	const ready = new Promise<App | null>((resolve) => (settle = resolve));
	let active = true;
	/** Counts guarded navigations: a hook result for an older one is dropped. */
	let token = 0;
	/**
	 * What the navigation this code starts next carries: the URL of one the hooks already
	 * allowed (so it isn't checked twice) and how many redirects led to it. Read and cleared by
	 * the next `beforeNavigate`, whatever it is.
	 */
	let next: { allowed?: string; redirects: number } | null = null;

	/** Navigates to a guard's redirect, whose own hooks then run. */
	function redirect(path: string, from: URL, redirects: number, replaceState = false) {
		if (redirects >= MAX_REDIRECTS) {
			void app.reportError(
				new Error(`onNavigate redirected more than ${MAX_REDIRECTS} times; stopped at ${path}.`)
			);
			return;
		}
		next = { redirects: redirects + 1 };
		// The URL has the base path.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(new URL(data.base + path, from), { replaceState });
	}

	beforeNavigate((nav) => {
		const carried = next;
		next = null;
		// Links to app paths SvelteKit has no route for unload the page (`404.html` then boots
		// the app), but they are still the app's navigations, so they are guarded too.
		if (!nav.to || nav.type === 'leave' || !appLoaded()) return;
		const target = nav.to.url;
		if (target.origin !== location.origin) return;
		if (carried?.allowed === target.href) return;
		const to = route(target);
		if (!to) return;
		const redirects = carried?.redirects ?? 0;
		const from = nav.from ? route(nav.from.url) : null;
		const current = ++token;
		const result = app.hooks.firstNow('onNavigate', [to, from], { path: to.path });
		if (!(result instanceof Promise)) {
			// Every hook answered synchronously: decide now, before SvelteKit navigates.
			if (result === false) nav.cancel();
			else if (typeof result === 'string') {
				nav.cancel();
				redirect(result, target, redirects);
			}
			return;
		}
		// A hook is async: hold the navigation and repeat it once the hooks allow it. SvelteKit
		// undoes a held back/forward navigation, so that one is repeated with history.go().
		nav.cancel();
		const delta = nav.type === 'popstate' ? (nav.delta ?? 0) : 0;
		void result.then((answer) => {
			if (!active || current !== token || answer === false) return;
			if (typeof answer === 'string') return redirect(answer, target, redirects);
			next = { allowed: target.href, redirects };
			if (delta) history.go(delta);
			// `goto` can't know the original link's options (e.g. `data-sveltekit-replacestate`).
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			else void goto(target);
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
				// The first page was loaded, not navigated to: its guards run now. A redirect
				// replaces it in history; `false` can't take back a page that is already showing.
				const first = route(new URL(location.href));
				if (first) {
					const answer = await loaded.hooks.first('onNavigate', [first, null], {
						path: first.path
					});
					if (active && typeof answer === 'string')
						redirect(answer, new URL(location.href), 0, true);
				}
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
