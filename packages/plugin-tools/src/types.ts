import type { HomeShortcuts } from './home.js';
import type { Tool } from './options.js';

/** Home's pinned and recently used tools (`app.tools.shortcuts`, page only). */
export type ToolShortcuts = {
	/** Empty until the app boots and loads what's saved. */
	readonly state: HomeShortcuts;
	/** Calls `listener` now and on every change; returns a function that stops it. */
	subscribe(listener: (state: HomeShortcuts) => void): () => void;
	/** Pins or unpins a tool, with a toast; false if it couldn't be saved. */
	togglePin(path: string): boolean;
	/** Moves a pin one place up (-1) or down (1). */
	movePin(path: string, by: -1 | 1): boolean;
	/** Records opening a page; only tools that aren't private become Recently used. */
	visit(path: string): void;
	/** Re-reads what's saved (after this tab cleared or imported data). */
	reload(): void;
};

/** `app.tools`, in the build and the page entry. */
export type AppTools = {
	/** The index page's path. */
	readonly index: string;
	/** Every tool, in order. */
	list(): readonly Tool[];
	get(path: string): Tool | undefined;
	/**
	 * Adds a tool. Call it while plugins register, from both your build entry (which adds its
	 * page to the route registry, so don't also `app.route()` it) and your page entry.
	 */
	add(tool: Tool): void;
	/** Only in the page. */
	readonly shortcuts?: ToolShortcuts;
};

declare module '@xcwds/core' {
	interface App {
		/** From `@xcwds/plugin-tools`. */
		readonly tools?: AppTools;
	}
}
