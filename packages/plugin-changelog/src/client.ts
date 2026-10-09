/**
 * The page entry, ported from xcwds.github.io's `changelog.ts` and the What's new section in
 * Settings. It saves the newest entry the user has seen (`app:changelog:seen`): a fresh install
 * saves the newest one straight away, so it badges nothing. After an update (the marker from
 * `@xcwds/plugin-update`) with notes the user hasn't seen, a toast links to What's new, which
 * `@xcwds/plugin-settings` shows on its page.
 *
 * Imported at prerender too, so it only touches browser globals once the app boots.
 */
import { definePlugin } from '@xcwds/core';
import type { Component } from 'svelte';
import {
	NAME,
	latestId,
	resolveOptions,
	type ChangelogEntry,
	type ChangelogOptions
} from './options.js';

/** What this plugin uses of `app.settingsPage` (from `@xcwds/plugin-settings`, if present). */
type SettingsPageLike = {
	readonly options: { path: string };
	add(component: Component, options?: { order?: number }): () => void;
};
/** What this plugin uses of `app.update` (from `@xcwds/plugin-update`, if present). */
type UpdateLike = { readonly state: { justUpdated: boolean } };
/** What this plugin uses of `app.toast` (from `@xcwds/plugin-shell`, if present). */
type ToastLike = (
	message: string,
	options?: { action?: { label: string; path: string; hash?: string } }
) => void;

/** The element id of the What's new section, for links to it. */
export const SECTION_ID = 'whats-new';

/** `app.changelog`. */
export type AppChangelog = {
	/** The entries What's new lists (the newest `show`), newest first. */
	readonly entries: readonly ChangelogEntry[];
	/** The newest entry's id, or 0. */
	readonly latest: number;
	/** The newest entry id the user has seen; entries above it are new. */
	seen(): number;
	/** Marks every entry seen (What's new does when it shows). */
	markSeen(): void;
	/** Calls `listener` now and whenever `seen()` changes; returns a function that stops it. */
	subscribe(listener: (seen: number) => void): () => void;
};

declare module '@xcwds/core' {
	interface App {
		/** From `@xcwds/plugin-changelog`. */
		readonly changelog?: AppChangelog;
	}
}

const parseSeen = (v: unknown) =>
	typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;

export default definePlugin(
	(app, input: ChangelogOptions) => {
		const options = resolveOptions(input);
		const latest = latestId(options.entries);
		const entry = app.storage.entry('seen', {
			label: "What's new",
			parse: parseSeen,
			...(options.storageKey ? { key: options.storageKey } : {})
		});
		// Until boot reads the saved value, nothing is new (so prerendered pages badge nothing).
		let seen = latest;
		const listeners = new Set<(seen: number) => void>();
		const set = (next: number) => {
			if (next === seen) return;
			seen = next;
			for (const listener of listeners) listener(seen);
		};
		const load = () => {
			const saved = app.storage.read(entry);
			if (saved === undefined) {
				// A fresh install (or cleared data): everything so far counts as seen.
				if (latest > 0) app.storage.write(entry, latest);
				set(latest);
			} else set(saved);
		};
		let booted = false;
		const stops: (() => void)[] = [];

		app.decorate('changelog', {
			entries: options.entries.slice(0, options.show),
			latest,
			seen: () => seen,
			markSeen() {
				if (!booted || seen >= latest) return;
				app.storage.write(entry, latest);
				set(latest);
			},
			subscribe(listener) {
				listeners.add(listener);
				listener(seen);
				return () => void listeners.delete(listener);
			}
		} satisfies AppChangelog);

		app.addHook('onBoot', () => {
			booted = true;
			load();
			stops.push(
				app.storage.onChange((key) => {
					if (key === null || key === entry.key) load();
				})
			);
			// With @xcwds/plugin-settings, What's new is a section of its page. Loaded lazily: the
			// component imports @xcwds/sveltekit, which imports this entry.
			const page = (app as { settingsPage?: SettingsPageLike }).settingsPage;
			if (page && options.entries.length)
				void import('./WhatsNew.svelte').then(({ default: WhatsNew }) => {
					if (booted) stops.push(page.add(WhatsNew, { order: 300 }));
				});
		});
		app.addHook('onReady', () => {
			const update = (app as { update?: UpdateLike }).update;
			const toast = (app as { toast?: ToastLike }).toast;
			if (!update?.state.justUpdated || !toast || seen >= latest) return;
			const page = (app as { settingsPage?: SettingsPageLike }).settingsPage;
			toast(
				'App updated.',
				page
					? { action: { label: "See what's new", path: page.options.path, hash: `#${SECTION_ID}` } }
					: {}
			);
		});
		app.addHook('onClose', () => {
			booted = false;
			for (const stop of stops.splice(0)) stop();
		});
	},
	{ name: NAME, encapsulate: false, network: false }
);
