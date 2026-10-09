import type { Entry } from '@xcwds/core';
import { onMount } from 'svelte';
import { getApp, whenLoaded } from './runtime.svelte.js';

export type PersistOptions = {
	/** Runs when another tab removes the entry. */
	cleared?: () => void;
	/** `false` for per-window UI state (e.g. an open tab) that shouldn't follow other windows. */
	sync?: boolean;
};

/**
 * Keeps component state in sync with a storage entry (ported from xcwds.github.io). Loads it
 * after mount, so prerendered HTML and hydration agree, then saves only when the value actually
 * changes: just opening a page never writes, so "nothing saved yet" stays meaningful. Returning
 * `undefined` from `get` removes the entry. Call during component init.
 *
 * Changes another tab saves are loaded as they happen, so a stale copy here never overwrites
 * them. `set` may then get a value with fields missing (another tab dropped them): treat a
 * missing field as "back to the default", not "keep mine", or the next save here writes the old
 * value back. A failed save is reported once through `app.storage.onSaveFailure`.
 *
 *   persist(app.timers.presets, () => presets, (v) => (presets = v));
 *
 * Returns `markSaved()`: call it right after saving the current value yourself (with
 * `app.storage.update()`, to report the result), so it isn't written a second time.
 */
export function persist<T>(
	entry: Entry<T>,
	get: () => T | undefined,
	set: (value: T) => void,
	{ cleared, sync = true }: PersistOptions = {}
): { markSaved: () => void } {
	let loaded = $state(false);
	/** JSON of the value as last loaded or saved; unchanged values aren't written again. */
	let baseline: string | undefined;

	function load() {
		const saved = getApp().storage.read(entry);
		if (saved !== undefined) set(saved);
		else if (loaded) cleared?.();
		baseline = JSON.stringify(get());
	}

	onMount(() => {
		let active = true;
		let stop: (() => void) | undefined;
		// Read only once plugins have loaded, so their migrations have run.
		whenLoaded((app) => {
			if (!active) return;
			load();
			loaded = true;
			// The app forwards `storage` events (other tabs) once `<App>` has mounted; `key` is
			// null when everything was cleared.
			if (sync)
				stop = app.storage.onChange((key) => {
					if (key === null || key === entry.key) load();
				});
		});
		return () => {
			active = false;
			stop?.();
		};
	});

	$effect(() => {
		// Serialising inside the effect tracks every nested field of the value.
		const json = JSON.stringify(get());
		if (!loaded || json === baseline) return;
		baseline = json;
		const storage = getApp().storage;
		storage.saveResult(
			entry,
			json === undefined ? storage.remove(entry) : storage.write(entry, JSON.parse(json) as T)
		);
	});

	return {
		markSaved() {
			baseline = JSON.stringify(get());
		}
	};
}
