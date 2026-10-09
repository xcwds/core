/**
 * Reactive settings for components (RFC 0001, decision 6): the kernel's settings wrapped in
 * Svelte 5 state. Like xcwds.github.io, saved settings load after the page mounts, so the
 * prerendered HTML and hydration agree; until then `current` holds the defaults and `ready` is
 * false. Seed page state from settings in an effect gated on `settings.ready`.
 */
import type { App, Settings } from '@xcwds/core';
import { appLoaded, getApp } from './runtime.svelte.js';

export type SettingsValues = Readonly<Settings & Record<string, unknown>>;
type Patch = Partial<Settings> & Record<string, unknown>;

const EMPTY: SettingsValues = Object.freeze({}) as SettingsValues;

class ReactiveSettings {
	#values = $state.raw<SettingsValues | null>(null);
	#ready = $state(false);
	#defaults: SettingsValues | null = null;

	/** The settings: the defaults until saved ones load after mount, then live. */
	get current(): SettingsValues {
		if (this.#values) return this.#values;
		if (!appLoaded()) return EMPTY;
		return (this.#defaults ??= getApp().settings.defaults());
	}

	/** Whether saved settings have loaded. */
	get ready(): boolean {
		return this.#ready;
	}

	/** Changes fields and saves in the background (a failure is reported once). */
	set(patch: Patch): void {
		getApp().settings.set(patch);
	}

	update(change: (current: SettingsValues) => Patch): void {
		getApp().settings.update(change);
	}

	/** Puts fields (default: all) back to their defaults. */
	reset(names?: string[]): void {
		getApp().settings.reset(names);
	}

	/** Saves now and returns whether it worked, for actions that confirm a save. */
	save(): boolean {
		return getApp().settings.save();
	}

	/** Follows the app's settings from now on (called by `<App>` after mount). */
	attach(app: App): () => void {
		this.#values = app.settings.get();
		this.#ready = true;
		const stop = app.settings.subscribe((next) => {
			this.#values = next;
		});
		return () => {
			stop();
			this.#ready = false;
			this.#values = null;
			this.#defaults = null;
		};
	}
}

export const settings = new ReactiveSettings();
