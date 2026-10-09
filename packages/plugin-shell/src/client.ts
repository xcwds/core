/**
 * The page entry. Adds the `nav` setting (applied before first paint), toasts (`app.toast`) and
 * `app.shell`: the sections from the config and the places other plugins add components to
 * (Home blocks and header actions).
 *
 * Imported at prerender too, so it only touches browser globals once the app boots.
 */
import { definePlugin } from '@xcwds/core';
import type { Component } from 'svelte';
import {
	APPLY_NAV,
	DEFAULT_NAV,
	NAME,
	applyNav,
	parseNav,
	resolveOptions,
	type NavSetting,
	type Section,
	type ShellOptions
} from './options.js';

/** A link shown with a toast: an app path, plus an optional `#hash`. */
export type ToastAction = { label: string; path: string; hash?: string };
export type Toast = { id: number; message: string; action?: ToastAction };
export type ToastOptions = {
	action?: ToastAction;
	/** How long it shows. Defaults to 3 s, or 8 s with an action (so it can be tapped). */
	durationMs?: number;
};

/** A component a plugin adds to the shell, in `order` (lowest first, then as added). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Slot = { component: Component<any>; props?: Record<string, unknown>; order: number };

type SlotList = {
	/** Adds a component; returns a function that removes it. */
	add(
		component: Slot['component'],
		options?: { props?: Record<string, unknown>; order?: number }
	): () => void;
	list(): readonly Slot[];
	/** Calls `listener` now and on every change; returns a function that stops it. */
	subscribe(listener: (slots: readonly Slot[]) => void): () => void;
};

/** `app.shell`. */
export type AppShell = {
	readonly sections: readonly Section[];
	/** Blocks on the Home page (`/`), e.g. pinned and recent tools. */
	readonly home: SlotList;
	/** Buttons in the header beside the title, e.g. Share. */
	readonly header: SlotList;
	/** The toasts showing now; `subscribe` to follow them. */
	readonly toasts: {
		list(): readonly Toast[];
		subscribe(listener: (toasts: readonly Toast[]) => void): () => void;
		dismiss(id: number): void;
	};
};

declare module '@xcwds/core' {
	interface Settings {
		/** From `@xcwds/plugin-shell`: header links or a sidebar on wider screens, per orientation. */
		nav: NavSetting;
	}
	interface App {
		/** From `@xcwds/plugin-shell`. */
		readonly shell?: AppShell;
		/** From `@xcwds/plugin-shell`: shows a short confirmation in the notification stack. */
		readonly toast?: (message: string, options?: ToastOptions) => void;
	}
}

/** At most this many toasts show at once; older ones go first. */
const MAX_TOASTS = 3;

function slotList(): SlotList {
	let slots: Slot[] = [];
	const listeners = new Set<(slots: readonly Slot[]) => void>();
	const changed = () => {
		for (const listener of listeners) listener(slots);
	};
	return {
		add(component, { props, order = 0 } = {}) {
			const slot: Slot = { component, ...(props ? { props } : {}), order };
			// Stable: equal orders keep the order they were added in.
			slots = [...slots, slot].sort((a, b) => a.order - b.order);
			changed();
			return () => {
				slots = slots.filter((s) => s !== slot);
				changed();
			};
		},
		list: () => slots,
		subscribe(listener) {
			listeners.add(listener);
			listener(slots);
			return () => void listeners.delete(listener);
		}
	};
}

export default definePlugin(
	(app, input: ShellOptions) => {
		const options = resolveOptions(input);
		app.settings.field('nav', {
			default: DEFAULT_NAV,
			parse: parseNav,
			label: 'Navigation',
			section: 'appearance',
			prePaint: APPLY_NAV
		});

		let toasts: Toast[] = [];
		const timers = new Map<number, ReturnType<typeof setTimeout>>();
		const toastListeners = new Set<(toasts: readonly Toast[]) => void>();
		const setToasts = (next: Toast[]) => {
			toasts = next;
			for (const listener of toastListeners) listener(toasts);
		};
		let nextId = 1;
		const dismiss = (id: number) => {
			clearTimeout(timers.get(id));
			timers.delete(id);
			if (toasts.some((t) => t.id === id)) setToasts(toasts.filter((t) => t.id !== id));
		};

		app.decorate('shell', {
			sections: options.sections,
			home: slotList(),
			header: slotList(),
			toasts: {
				list: () => toasts,
				subscribe(listener) {
					toastListeners.add(listener);
					listener(toasts);
					return () => void toastListeners.delete(listener);
				},
				dismiss
			}
		} satisfies AppShell);
		app.decorate('toast', (message: string, { action, durationMs }: ToastOptions = {}) => {
			const id = nextId++;
			const next = [...toasts, { id, message, ...(action ? { action } : {}) }];
			for (const old of next.splice(0, Math.max(0, next.length - MAX_TOASTS))) {
				clearTimeout(timers.get(old.id));
				timers.delete(old.id);
			}
			setToasts(next);
			timers.set(
				id,
				setTimeout(() => dismiss(id), durationMs ?? (action ? 8000 : 3000))
			);
		});

		let stop: (() => void) | undefined;
		app.addHook('onBoot', () => {
			const root = document.documentElement;
			const apply = () => applyNav(app.settings.get().nav, root);
			apply();
			stop = app.settings.subscribe(apply);
		});
		app.addHook('onClose', () => {
			stop?.();
			stop = undefined;
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		});
	},
	{ name: NAME, encapsulate: false, network: false }
);
