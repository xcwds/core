/**
 * Storage shared by simulated tabs. Each tab gets its own adapter; a change one tab saves
 * reaches the others as a `storage` event, as `localStorage` does in a browser (never the tab
 * that saved, and only when the value really changed). Events are delivered in a microtask;
 * `settled()` waits for them.
 */
import { memoryStorage, type StorageAdapter } from '@xcwds/core';

/** The parts of a `StorageEvent` the kernel reads. */
export class FakeStorageEvent extends Event {
	readonly key: string | null;
	readonly oldValue: string | null;
	readonly newValue: string | null;
	readonly storageArea = null;

	constructor(key: string | null, oldValue: string | null, newValue: string | null) {
		super('storage');
		this.key = key;
		this.oldValue = oldValue;
		this.newValue = newValue;
	}
}

export type SharedStorage = {
	/** Where the values live. */
	readonly backing: StorageAdapter;
	/** An adapter for one tab; its writes reach every other connected tab as events. */
	connect(tab: EventTarget): StorageAdapter & { disconnect(): void };
	/** Clears everything, like another tab calling `localStorage.clear()` (key `null`, if anything was saved). */
	clear(): void;
	/** Resolves once every queued `storage` event has been delivered. */
	settled(): Promise<void>;
};

export function isSharedStorage(value: unknown): value is SharedStorage {
	return typeof value === 'object' && value !== null && 'connect' in value && 'backing' in value;
}

export function sharedStorage(backing: StorageAdapter = memoryStorage()): SharedStorage {
	const tabs = new Set<EventTarget>();
	let pending: Promise<void> = Promise.resolve();

	function notify(
		from: EventTarget | null,
		key: string | null,
		old: string | null,
		value: string | null
	) {
		const targets = [...tabs].filter((t) => t !== from);
		pending = pending.then(() => {
			for (const tab of targets)
				if (tabs.has(tab)) tab.dispatchEvent(new FakeStorageEvent(key, old, value));
		});
	}

	return {
		backing,
		connect(tab) {
			tabs.add(tab);
			return {
				get: (key) => backing.get(key),
				set(key, value) {
					const old = backing.get(key);
					backing.set(key, value);
					if (old !== value) notify(tab, key, old, value);
				},
				remove(key) {
					const old = backing.get(key);
					backing.remove(key);
					if (old !== null) notify(tab, key, old, null);
				},
				keys: () => backing.keys(),
				disconnect: () => void tabs.delete(tab)
			};
		},
		clear() {
			const keys = backing.keys();
			// Like localStorage.clear(), clearing an empty store changes nothing: no event.
			if (keys.length === 0) return;
			for (const key of keys) backing.remove(key);
			notify(null, null, null, null);
		},
		async settled() {
			// Events can queue more events (a tab saving in response): wait until none are left.
			let seen: Promise<void>;
			do {
				seen = pending;
				await seen;
			} while (seen !== pending);
		}
	};
}
