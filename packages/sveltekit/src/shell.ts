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

/** The next `popstate` event, or a moment later if none comes. */
function popstate(): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			removeEventListener('popstate', done);
			clearTimeout(timer);
			// Let SvelteKit's own popstate handling finish first.
			setTimeout(resolve);
		};
		const timer = setTimeout(done, 500);
		addEventListener('popstate', done);
	});
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
		const sync = !(result instanceof Promise);
		// Every hook answered synchronously and lets it go ahead: nothing to do.
		if (sync && result !== false && typeof result !== 'string') return;
		nav.cancel();
		// SvelteKit undoes a cancelled back/forward navigation with history.go(-delta). Anything
		// that changes history must wait for that, or the browser drops it.
		const delta = nav.type === 'popstate' ? (nav.delta ?? 0) : 0;
		const reverted = delta ? popstate() : Promise.resolve();
		void Promise.all([result, reverted]).then(([answer]) => {
			if (!active || current !== token || answer === false) return;
			if (typeof answer === 'string') return redirect(answer, target, redirects);
			// An async hook held it and allows it: repeat it, marked so it isn't checked again.
			const marker = { allowed: target.href, redirects };
			next = marker;
			// Should the repeat never reach beforeNavigate, the mark mustn't let a later visit skip
			// the guards.
			setTimeout(() => {
				if (next === marker) next = null;
			}, 1000);
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
		// The first page was loaded, not navigated to: its guards run once the app has booted.
		// Captured now: by then the user may have navigated, and the redirect is only for this.
		const initial = new URL(location.href);
		const initialToken = token;
		void loadApp()
			.then(async (loaded) => {
				if (!active) return null;
				stops.push(settings.attach(loaded), loaded.storage.startSync(window));
				if (!booted.has(loaded)) {
					booted.add(loaded);
					await loaded.hooks.run('onBoot', []);
				}
				await loaded.ready();
				// A redirect replaces the first page in history; `false` can't take back a page that is
				// already showing. Either is dropped once the user has navigated elsewhere.
				const first = route(initial);
				if (first) {
					const answer = await loaded.hooks.first('onNavigate', [first, null], {
						path: first.path
					});
					if (
						active &&
						typeof answer === 'string' &&
						token === initialToken &&
						location.href === initial.href
					)
						redirect(answer, initial, 0, true);
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
