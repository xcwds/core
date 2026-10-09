/**
 * Saved data, generalised from xcwds.github.io's `src/lib/storage.ts` (#8). Every value an app
 * saves is a registered entry with a key, a label and a validator. Reads never throw: missing,
 * corrupt, invalid or blocked storage all read as `undefined`. Each plugin has a namespace
 * (`app:<namespace>:<key>`) with its own schema version and migrations.
 *
 * Namespaces keep plugins from clobbering each other by accident. They are not a security
 * boundary: any script on the origin can read all of `localStorage`, so plugins are trusted code.
 */
import { XcwdsError, codes } from './errors.js';
import { isRecord } from './json.js';

// ---------------------------------------------------------------------------------------------
// Adapters

/**
 * Where values are kept. Methods may throw (storage blocked, quota exceeded); the registry
 * catches. `localStorage` is synchronous and holds about 5 MB per origin; an IndexedDB-backed
 * adapter can replace it later without changing entries.
 */
export type StorageAdapter = {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
	keys(): string[];
};

/** `localStorage`, looked up on every call so a blocked or missing one just fails that call. */
export function localStorageAdapter(): StorageAdapter {
	const store = () => {
		const s = globalThis.localStorage;
		if (!s) throw new Error('localStorage is not available');
		return s;
	};
	return {
		get: (key) => store().getItem(key),
		set: (key, value) => store().setItem(key, value),
		remove: (key) => store().removeItem(key),
		keys: () => {
			const s = store();
			const out: string[] = [];
			for (let i = 0; i < s.length; i++) {
				const key = s.key(i);
				if (key !== null) out.push(key);
			}
			return out;
		}
	};
}

/** An in-memory adapter for tests and for environments without storage. */
export function memoryStorage(initial: Record<string, string> = {}): StorageAdapter & {
	data: Map<string, string>;
} {
	const data = new Map(Object.entries(initial));
	return {
		data,
		get: (key) => data.get(key) ?? null,
		set: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()]
	};
}

// ---------------------------------------------------------------------------------------------
// Entries and migrations

export type Entry<T> = {
	/** The full storage key, e.g. `app:timers:presets`. */
	readonly key: string;
	/** Human-readable, for Settings and backups. */
	readonly label: string;
	/** Returns the value if `raw` is valid for this entry, otherwise `undefined`. */
	readonly parse: (raw: unknown) => T | undefined;
	/** Lets users clear one area (e.g. workout history) without wiping another. */
	readonly group: string;
	readonly namespace: string;
};

export type EntryOptions<T> = {
	label: string;
	parse: (raw: unknown) => T | undefined;
	/** Defaults to the namespace (or the key's name at the root). */
	group?: string;
	/**
	 * An exact key instead of `app:<namespace>:<name>`, so an app moving onto the framework keeps
	 * the keys its users already have (e.g. `app:settings`). It must start with the prefix.
	 */
	key?: string;
};

/**
 * Upgrades a namespace's saved data to schema version `to`. `data` holds the decoded values of
 * the namespace's keys (and `keys`), keyed by full storage key; change it in place. Keys
 * deleted from it are removed. Migrations run on this device's storage and on older backups.
 */
export type Migration = {
	to: number;
	/** Extra full keys to include, e.g. keys from before the namespace existed. */
	keys?: string[];
	run(data: Record<string, unknown>): void;
};

export type Group = { id: string; label: string; entries: Entry<unknown>[] };

export type Backup = {
	app: string;
	format: 2;
	exportedAt: string;
	/** Schema version per namespace (`''` is the app's own). */
	versions: Record<string, number>;
	/** Saved values keyed by storage key. */
	data: Record<string, unknown>;
	/** Values no registered plugin claims (a plugin that was removed), kept so they can return. */
	unclaimed: Record<string, unknown>;
};

export type ParsedBackup =
	| {
			ok: true;
			backup: Backup;
			/** Entries the backup has valid data for. */
			found: Entry<unknown>[];
			/** Keys that are unknown or failed validation; they won't be imported. */
			skipped: string[];
	  }
	| { ok: false; error: string };

export type UnclaimedKey = { key: string; namespace: string };

export type ChangeListener = (key: string | null, value: unknown) => void;

export type SaveFailureListener = (entry: Entry<unknown>, options: { explicit: boolean }) => void;

/** The storage API every plugin gets as `app.storage`, bound to its namespace. */
export type StorageScope = Omit<StorageRegistry, 'scope'> & {
	readonly namespace: string;
	/** Registers an entry under this namespace. */
	entry<T>(name: string, options: EntryOptions<T>): Entry<T>;
	/** Registers a migration for this namespace. Register before reading. */
	migration(migration: Migration): void;
};

export type StorageRegistry = {
	readonly prefix: string;
	scope(namespace: string): StorageScope;
	/** Every registered entry. */
	entries(): Entry<unknown>[];
	groups(): Group[];

	read<T>(entry: Entry<T>): T | undefined;
	/** Saves a value; false if it couldn't be stored (unavailable, full). */
	write<T>(entry: Entry<T>, value: T): boolean;
	remove(entry: Entry<unknown>): boolean;
	/** The value `update()` starts from: what's saved, or `current` when storage can't be used. */
	latest<T>(
		entry: Entry<T>,
		current: T | undefined,
		options?: { unsaved?: boolean }
	): T | undefined;
	/**
	 * Applies `change` to the latest saved value and saves it, so one tab never overwrites what
	 * another saved meanwhile. `undefined` removes the entry.
	 */
	update<T>(
		entry: Entry<T>,
		current: T | undefined,
		change: (latest: T | undefined) => T | undefined,
		options?: { unsaved?: boolean }
	): { value: T | undefined; saved: boolean };
	/** Whether this browser lets the app save at all. */
	writable(): boolean;
	/** Removes the given entries (default: every registered entry). */
	clear(list?: Entry<unknown>[]): void;

	/** Records a write's outcome; a failure is reported once per entry unless `explicit`. */
	saveResult(entry: Entry<unknown>, saved: boolean, options?: { explicit?: boolean }): boolean;
	/** Whether the last write of `entry` failed, so this tab holds changes storage doesn't. */
	hasUnsavedChanges(entry: Entry<unknown>): boolean;
	onSaveFailure(listener: SaveFailureListener): () => void;

	/** Listens for changes other tabs save (`key` is null when everything was cleared). */
	onChange(listener: ChangeListener): () => void;
	/** Starts listening for `storage` events. Browser only; returns a stop function. */
	startSync(target?: EventTarget): () => void;
	stopSync(): void;

	exportData(now?: Date): Backup;
	parseBackup(text: string): ParsedBackup;
	/** `replace` clears every registered entry first; `merge` keeps what the backup lacks. */
	importData(backup: Backup, mode: 'replace' | 'merge'): boolean;
	/** Saved keys no registered plugin claims. */
	unclaimed(): UnclaimedKey[];
	/** Deletes unclaimed keys (claimed keys are refused). */
	removeUnclaimed(keys: string[]): void;

	/** Asks the browser not to evict this site's data under storage pressure. */
	requestPersistence(): Promise<'granted' | 'denied' | 'unsupported'>;
	persisted(): Promise<boolean | 'unsupported'>;
};

export type StorageOptions = {
	adapter?: StorageAdapter | undefined;
	/** Defaults to `app:`. */
	prefix?: string | undefined;
	/** Written into backups and checked on import. */
	appName?: string | undefined;
	/** Where unexpected errors (a failing migration) are reported. */
	onError?: ((error: unknown) => void) | undefined;
};

/** Values were JSON, except a few raw strings older apps saved. */
function decode(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

const NAMESPACE = /^[a-z0-9][a-z0-9-]*$/;
const NAME = /^[^\s]+$/;

export function createStorage(options: StorageOptions = {}): StorageRegistry {
	const prefix = options.prefix ?? 'app:';
	const adapter = options.adapter ?? localStorageAdapter();
	const appName = options.appName ?? 'xcwds';
	const onError = options.onError ?? ((error) => console.error(error));

	const entries = new Map<string, Entry<unknown>>();
	type Ns = { migrations: Migration[]; migrated: number | null; failed: boolean };
	const namespaces = new Map<string, Ns>();
	const failing = new Set<string>();
	const changeListeners = new Set<ChangeListener>();
	const failureListeners = new Set<SaveFailureListener>();
	let stop: (() => void) | null = null;

	const nsPrefix = (ns: string) => (ns ? `${prefix}${ns}:` : prefix);
	const versionKey = (ns: string) => (ns ? `${prefix}version:${ns}` : `${prefix}version`);
	const isVersionKey = (key: string) =>
		key === `${prefix}version` || key.startsWith(`${prefix}version:`);
	const namespace = (ns: string): Ns => {
		let n = namespaces.get(ns);
		if (!n) namespaces.set(ns, (n = { migrations: [], migrated: null, failed: false }));
		return n;
	};
	const latestVersion = (ns: string) =>
		Math.max(0, ...(namespaces.get(ns)?.migrations.map((m) => m.to) ?? []));

	/** The namespace that owns `key`: its entry's, or the registered namespace it's under. */
	function owner(key: string): string | undefined {
		const e = entries.get(key);
		if (e) return e.namespace;
		let best: string | undefined;
		for (const ns of namespaces.keys()) {
			if (ns && key.startsWith(nsPrefix(ns)) && (!best || ns.length > best.length)) best = ns;
		}
		return best;
	}

	function keysOf(ns: string, available: Iterable<string>, extra: string[] = []): string[] {
		const out = new Set<string>();
		for (const e of entries.values()) if (e.namespace === ns) out.add(e.key);
		for (const key of available) {
			if (ns && key.startsWith(nsPrefix(ns)) && !isVersionKey(key)) out.add(key);
			if (extra.includes(key)) out.add(key);
		}
		return [...out];
	}

	/** Runs `migrations` newer than `from` over `data`, in order. */
	function upgrade(ns: string, data: Record<string, unknown>, from: number) {
		const pending = namespace(ns)
			.migrations.filter((m) => m.to > from)
			.sort((a, b) => a.to - b.to);
		for (const m of pending) m.run(data);
	}

	/** Brings this device's data for `ns` up to the newest registered migration, once. */
	function ensure(ns: string): void {
		const n = namespace(ns);
		const target = latestVersion(ns);
		if (n.failed || (n.migrated !== null && n.migrated >= target)) return;
		const data: Record<string, unknown> = {};
		const before: Record<string, string> = {};
		let current: number;
		try {
			current = Number(adapter.get(versionKey(ns)) ?? 0) || 0;
			if (current < target) {
				const extra = n.migrations.flatMap((m) => m.keys ?? []);
				for (const key of keysOf(ns, adapter.keys(), extra)) {
					const text = adapter.get(key);
					if (text === null) continue;
					data[key] = decode(text);
					before[key] = text;
				}
			}
		} catch {
			// Storage is blocked: nothing to migrate this time.
			n.failed = true;
			return;
		}
		if (current < target) {
			try {
				upgrade(ns, data, current);
			} catch (cause) {
				// Leave the data as it was and try again next load.
				n.failed = true;
				onError(
					new XcwdsError(
						codes.STORAGE_MIGRATION,
						`Migrating saved data for "${ns || 'the app'}" failed.`,
						{ cause }
					)
				);
				return;
			}
			try {
				for (const key of Object.keys(before)) if (!(key in data)) adapter.remove(key);
				for (const [key, value] of Object.entries(data)) {
					const text = JSON.stringify(value);
					if (text !== before[key]) adapter.set(key, text);
				}
				adapter.set(versionKey(ns), String(target));
			} catch {
				// Storage full: the version isn't bumped, so the migration runs again next load.
				n.failed = true;
				return;
			}
		}
		// Newer data than this code knows is left untouched.
		n.migrated = Math.max(current, target);
	}

	function read<T>(e: Entry<T>): T | undefined {
		ensure(e.namespace);
		try {
			const text = adapter.get(e.key);
			return text == null ? undefined : e.parse(decode(text));
		} catch {
			return undefined;
		}
	}

	function write<T>(e: Entry<T>, value: T): boolean {
		ensure(e.namespace);
		try {
			adapter.set(e.key, JSON.stringify(value));
			return true;
		} catch {
			return false;
		}
	}

	function remove(e: Entry<unknown>): boolean {
		try {
			adapter.remove(e.key);
			return true;
		} catch {
			return false;
		}
	}

	function writable(): boolean {
		const probe = `${prefix}probe`;
		try {
			adapter.set(probe, '1');
			adapter.remove(probe);
			return true;
		} catch {
			return false;
		}
	}

	function latest<T>(e: Entry<T>, current: T | undefined, { unsaved = false } = {}) {
		return writable() && !unsaved ? read(e) : current;
	}

	function clear(list: Entry<unknown>[] = [...entries.values()]) {
		for (const e of list) remove(e);
	}

	function safeKeys(): string[] {
		try {
			return adapter.keys();
		} catch {
			return [];
		}
	}

	function unclaimed(): UnclaimedKey[] {
		return safeKeys()
			.filter((key) => key.startsWith(prefix) && !isVersionKey(key) && key !== `${prefix}probe`)
			.filter((key) => owner(key) === undefined)
			.map((key) => ({ key, namespace: key.slice(prefix.length).split(':')[0] ?? '' }));
	}

	function exportData(now = new Date()): Backup {
		const data: Record<string, unknown> = {};
		for (const e of entries.values()) {
			const value = read(e);
			if (value !== undefined) data[e.key] = value;
		}
		const versions: Record<string, number> = {};
		for (const ns of namespaces.keys()) versions[ns] = latestVersion(ns);
		const extra: Record<string, unknown> = {};
		for (const { key } of unclaimed()) {
			const text = adapter.get(key);
			if (text !== null) extra[key] = decode(text);
		}
		return {
			app: appName,
			format: 2,
			exportedAt: now.toISOString(),
			versions,
			data,
			unclaimed: extra
		};
	}

	function parseBackup(text: string): ParsedBackup {
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			return { ok: false, error: "This file isn't a backup (it's not valid JSON)." };
		}
		if (!isRecord(raw) || raw.app !== appName || !isRecord(raw.data))
			return { ok: false, error: "This file isn't a backup from this app." };
		// Backups made before namespaces had one `schemaVersion`: the app's own.
		const versions: Record<string, number> = {};
		if (raw.format === undefined) versions[''] = raw.schemaVersion as number;
		else if (isRecord(raw.versions)) Object.assign(versions, raw.versions);
		else return { ok: false, error: 'This backup has an unknown format.' };
		for (const [ns, version] of Object.entries(versions)) {
			if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
				return { ok: false, error: 'This backup has an unknown format version.' };
			if (version > latestVersion(ns))
				return {
					ok: false,
					error: 'This backup is from a newer version of the app. Update the app and try again.'
				};
		}
		const upgraded = structuredClone(raw.data) as Record<string, unknown>;
		const byNs = new Map<string, Record<string, unknown>>();
		const handled = new Set<string>();
		for (const [key, value] of Object.entries(upgraded)) {
			const ns =
				owner(key) ??
				[...namespaces.entries()].find(([, n]) =>
					n.migrations.some((m) => m.keys?.includes(key))
				)?.[0];
			if (ns === undefined) continue;
			handled.add(key);
			if (!byNs.has(ns)) byNs.set(ns, {});
			byNs.get(ns)![key] = value;
		}
		const data: Record<string, unknown> = {};
		const found: Entry<unknown>[] = [];
		const skipped: string[] = [];
		const unclaimedData: Record<string, unknown> = isRecord(raw.unclaimed)
			? { ...raw.unclaimed }
			: {};
		for (const [ns, subset] of byNs) {
			try {
				upgrade(ns, subset, versions[ns] ?? 0);
			} catch {
				return { ok: false, error: "This backup's data couldn't be upgraded." };
			}
			for (const [key, value] of Object.entries(subset)) {
				const e = entries.get(key);
				const parsed = e?.parse(value);
				if (e && parsed !== undefined) {
					data[key] = parsed;
					found.push(e);
				} else skipped.push(key);
			}
		}
		for (const key of Object.keys(upgraded)) {
			if (handled.has(key)) continue;
			if (key.startsWith(prefix) && !isVersionKey(key)) unclaimedData[key] = upgraded[key];
			else skipped.push(key);
		}
		for (const key of Object.keys(unclaimedData)) {
			if (owner(key) !== undefined || !key.startsWith(prefix) || isVersionKey(key))
				delete unclaimedData[key];
		}
		const backup: Backup = {
			app: appName,
			format: 2,
			exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
			versions: Object.fromEntries([...namespaces.keys()].map((ns) => [ns, latestVersion(ns)])),
			data,
			unclaimed: unclaimedData
		};
		return { ok: true, backup, found, skipped };
	}

	function importData(backup: Backup, mode: 'replace' | 'merge'): boolean {
		if (mode === 'replace') clear();
		let ok = true;
		for (const e of entries.values()) {
			if (e.key in backup.data) ok = write(e, backup.data[e.key]) && ok;
		}
		for (const [key, value] of Object.entries(backup.unclaimed ?? {})) {
			if (owner(key) !== undefined || !key.startsWith(prefix) || isVersionKey(key)) continue;
			try {
				if (mode === 'replace' || adapter.get(key) === null)
					adapter.set(key, JSON.stringify(value));
			} catch {
				ok = false;
			}
		}
		return ok;
	}

	const registry: StorageRegistry = {
		prefix,
		scope(ns) {
			if (ns !== '' && !NAMESPACE.test(ns))
				throw new XcwdsError(codes.STORAGE_KEY, `"${ns}" isn't a valid storage namespace.`);
			if (ns === 'version')
				throw new XcwdsError(codes.STORAGE_KEY, '"version" is reserved as a namespace.');
			namespace(ns);
			const { scope: _scope, ...rest } = registry;
			return {
				...rest,
				namespace: ns,
				entry<T>(name: string, opts: EntryOptions<T>): Entry<T> {
					if (!NAME.test(name))
						throw new XcwdsError(codes.STORAGE_KEY, `"${name}" isn't a valid entry name.`);
					const key = opts.key ?? `${nsPrefix(ns)}${name}`;
					if (
						!key.startsWith(prefix) ||
						key === prefix ||
						isVersionKey(key) ||
						key === `${prefix}probe`
					)
						throw new XcwdsError(codes.STORAGE_KEY, `"${key}" isn't a valid storage key.`);
					if (entries.has(key))
						throw new XcwdsError(
							codes.STORAGE_DUPLICATE_KEY,
							`The storage key "${key}" is already registered.`
						);
					if (typeof opts.parse !== 'function')
						throw new XcwdsError(codes.STORAGE_KEY, `The entry "${key}" needs a parse function.`);
					const e: Entry<T> = {
						key,
						label: opts.label,
						parse: opts.parse,
						group: opts.group ?? (ns || name.split(':')[0]!),
						namespace: ns
					};
					entries.set(key, e as Entry<unknown>);
					return e;
				},
				migration(m: Migration) {
					if (!Number.isInteger(m.to) || m.to < 1)
						throw new XcwdsError(
							codes.STORAGE_MIGRATION,
							'A migration needs an integer `to` of 1 or more.'
						);
					const n = namespace(ns);
					if (n.migrations.some((x) => x.to === m.to))
						throw new XcwdsError(
							codes.STORAGE_MIGRATION,
							`"${ns || 'the app'}" already has a migration to version ${m.to}.`
						);
					n.migrations.push(m);
				}
			};
		},
		entries: () => [...entries.values()],
		groups() {
			const out = new Map<string, Group>();
			for (const e of entries.values()) {
				if (!out.has(e.group)) out.set(e.group, { id: e.group, label: e.group, entries: [] });
				out.get(e.group)!.entries.push(e);
			}
			return [...out.values()];
		},
		read,
		write,
		remove,
		latest,
		update(e, current, change, opts = {}) {
			const value = change(latest(e, current, opts));
			const saved = value === undefined ? remove(e) : write(e, value);
			return { value, saved };
		},
		writable,
		clear,
		saveResult(e, saved, { explicit = false } = {}) {
			if (saved) {
				failing.delete(e.key);
				return true;
			}
			if (failing.has(e.key) && !explicit) return false;
			failing.add(e.key);
			if (failureListeners.size === 0) onError(new Error(`Couldn't save "${e.label}".`));
			for (const l of failureListeners) l(e, { explicit });
			return false;
		},
		hasUnsavedChanges: (e) => failing.has(e.key),
		onSaveFailure(listener) {
			failureListeners.add(listener);
			return () => failureListeners.delete(listener);
		},
		onChange(listener) {
			changeListeners.add(listener);
			return () => changeListeners.delete(listener);
		},
		startSync(target = globalThis as unknown as EventTarget) {
			stop?.();
			if (typeof target?.addEventListener !== 'function') return () => {};
			const handler = (event: Event) => {
				const { key, storageArea } = event as StorageEvent;
				if (storageArea && storageArea !== globalThis.localStorage) return;
				if (key !== null && (!key.startsWith(prefix) || isVersionKey(key))) return;
				const e = key === null ? undefined : entries.get(key);
				const value = e ? read(e) : undefined;
				for (const l of changeListeners) l(key, value);
			};
			target.addEventListener('storage', handler);
			stop = () => {
				target.removeEventListener('storage', handler);
				stop = null;
			};
			return stop;
		},
		stopSync: () => stop?.(),
		exportData,
		parseBackup,
		importData,
		unclaimed,
		removeUnclaimed(keys) {
			const allowed = new Set(unclaimed().map((u) => u.key));
			for (const key of keys) {
				if (!allowed.has(key)) continue;
				try {
					adapter.remove(key);
				} catch {
					// Blocked storage: nothing to delete.
				}
			}
		},
		async requestPersistence() {
			const storage = globalThis.navigator?.storage;
			if (!storage?.persist) return 'unsupported';
			try {
				return (await storage.persist()) ? 'granted' : 'denied';
			} catch {
				return 'denied';
			}
		},
		async persisted() {
			const storage = globalThis.navigator?.storage;
			if (!storage?.persisted) return 'unsupported';
			try {
				return await storage.persisted();
			} catch {
				return false;
			}
		}
	};
	return registry;
}
