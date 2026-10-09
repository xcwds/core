/**
 * App-wide settings that plugins extend with their own fields (#9). They are saved as one entry
 * (`app:settings`). A missing or invalid field reads as its default, so new fields need no
 * migration; fields nobody registers right now (a plugin that was removed) are kept as saved.
 */
import { XcwdsError, codes } from './errors.js';
import { isRecord } from './json.js';
import type { Entry, StorageRegistry } from './storage.js';

/**
 * Settings fields, typed by declaration merging:
 *
 *   declare module '@xcwds/core' { interface Settings { theme: 'system' | 'light' | 'dark' } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Settings {}

type Values = Settings & Record<string, unknown>;

export type FieldDefinition<T> = {
	default: T;
	/** Returns the value if `raw` is valid, otherwise `undefined` (the default is used). */
	parse: (raw: unknown) => T | undefined;
	label?: string;
	/** Where a settings page shows it, e.g. `appearance`. */
	section?: string;
	/**
	 * Plain ES5 that applies the field before first paint: a function body that gets the saved
	 * (or default) value as `v` and `document.documentElement` as `root`. It must validate `v`
	 * itself; it runs before any app code.
	 */
	prePaint?: string;
};

export type FieldInfo = {
	name: string;
	plugin: string;
	label: string;
	section: string;
	default: unknown;
};

export type SettingsListener = (next: Values, prev: Values) => void;

/** The settings API every plugin gets as `app.settings`. */
export type SettingsScope = {
	/** Adds a field. Names are app-wide: a clash fails with both plugins' names. */
	field<K extends keyof Settings & string>(name: K, definition: FieldDefinition<Settings[K]>): void;
	field<T>(name: string, definition: FieldDefinition<T>): void;
	/** The current settings. Treat as read-only; change them with `set` or `update`. */
	get(): Readonly<Values>;
	/** Changes fields and saves in the background (a failure is reported once). */
	set(patch: Partial<Settings> & Record<string, unknown>): void;
	update(change: (current: Readonly<Values>) => Partial<Settings> & Record<string, unknown>): void;
	/** Puts fields (default: all) back to their defaults. */
	reset(names?: string[]): void;
	/** Saves now, for actions that confirm a save. Returns whether it was saved. */
	save(): boolean;
	subscribe(listener: SettingsListener): () => void;
	/** Whether saved settings have been loaded (pages seed tool defaults only after this). */
	ready(): boolean;
	/** Reads the saved settings again (after an import or reset, or when first loading). */
	load(): void;
	defaults(): Values;
	fields(): FieldInfo[];
	/** The inline pre-paint script for every field with a `prePaint` snippet (RFC decision 4). */
	prePaintScript(): string;
	readonly entry: Entry<Values>;
};

export type SettingsRegistry = Omit<SettingsScope, 'field'> & {
	scope(plugin: string): SettingsScope;
};

const FIELD = /^[A-Za-z_$][\w$]*$/;
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export function createSettings(storage: StorageRegistry): SettingsRegistry {
	type Field = FieldDefinition<unknown> & { plugin: string };
	const fields = new Map<string, Field>();

	function parse(raw: unknown): Values | undefined {
		if (!isRecord(raw)) return undefined;
		const out: Record<string, unknown> = { ...raw };
		for (const [name, f] of fields) {
			const value = f.parse(raw[name]);
			out[name] = value === undefined ? clone(f.default) : value;
		}
		return out as Values;
	}

	const entry = storage.scope('').entry<Values>('settings', { label: 'Settings', parse });

	function defaults(): Values {
		const out: Record<string, unknown> = {};
		for (const [name, f] of fields) out[name] = clone(f.default);
		return out as Values;
	}

	let current: Values = defaults();
	let lastSaved = JSON.stringify(current);
	let loaded = false;
	const listeners = new Set<SettingsListener>();

	function notify(next: Values, prev: Values) {
		for (const l of listeners) l(next, prev);
	}

	function replace(next: Values, { save }: { save: boolean }) {
		const prev = current;
		if (JSON.stringify(next) === JSON.stringify(prev)) return;
		current = next;
		notify(next, prev);
		if (!save) return;
		const json = JSON.stringify(next);
		if (json === lastSaved) return;
		// Don't create saved data just because defaults were applied: only once something differs.
		if (json === JSON.stringify(defaults()) && storage.read(entry) === undefined) return;
		lastSaved = json;
		storage.saveResult(entry, storage.write(entry, next));
	}

	function checked(patch: Record<string, unknown>): Values {
		const next: Record<string, unknown> = { ...current };
		for (const [name, value] of Object.entries(patch)) {
			const f = fields.get(name);
			if (!f)
				throw new XcwdsError(codes.SETTINGS_FIELD_INVALID, `There's no setting called "${name}".`);
			const parsed = f.parse(value);
			if (parsed === undefined)
				throw new XcwdsError(
					codes.SETTINGS_FIELD_INVALID,
					`${JSON.stringify(value)} isn't a valid value for the "${name}" setting.`,
					{ plugin: f.plugin || undefined }
				);
			next[name] = parsed;
		}
		return next as Values;
	}

	function load() {
		const saved = storage.read(entry);
		const next = saved ?? defaults();
		lastSaved = JSON.stringify(next);
		loaded = true;
		replace(next, { save: false });
	}

	// Another tab saved settings (or cleared everything): load them, so a stale copy here is
	// never saved over them.
	storage.onChange((key) => {
		if (loaded && (key === null || key === entry.key)) load();
	});

	function prePaintScript(): string {
		const parts: string[] = [];
		for (const [name, f] of fields) {
			if (!f.prePaint) continue;
			const n = JSON.stringify(name);
			parts.push(
				`try{(function(v,root){${f.prePaint}})(has.call(s,${n})?s[${n}]:${JSON.stringify(f.default)},root)}catch(e){}`
			);
		}
		if (parts.length === 0) return '';
		return (
			'(function(){var s={};' +
			`try{s=JSON.parse(localStorage.getItem(${JSON.stringify(entry.key)})||'{}')}catch(e){}` +
			"if(!s||typeof s!=='object')s={};" +
			'var has=Object.prototype.hasOwnProperty,root=document.documentElement;' +
			parts.join('') +
			'})();'
		);
	}

	const shared: Omit<SettingsScope, 'field'> = {
		entry,
		get: () => current,
		set: (patch) => replace(checked(patch), { save: true }),
		update: (change) => replace(checked(change(current)), { save: true }),
		reset(names) {
			const d = defaults();
			const next: Record<string, unknown> = { ...current };
			for (const name of names ?? [...fields.keys()]) if (fields.has(name)) next[name] = d[name];
			replace(next as Values, { save: true });
		},
		save() {
			lastSaved = JSON.stringify(current);
			return storage.saveResult(entry, storage.write(entry, current), { explicit: true });
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		ready: () => loaded,
		load,
		defaults,
		fields: () =>
			[...fields].map(([name, f]) => ({
				name,
				plugin: f.plugin,
				label: f.label ?? name,
				section: f.section ?? 'general',
				default: clone(f.default)
			})),
		prePaintScript
	};

	return {
		...shared,
		scope(plugin) {
			return {
				...shared,
				field(name: string, definition: FieldDefinition<unknown>) {
					if (!FIELD.test(name))
						throw new XcwdsError(
							codes.SETTINGS_FIELD_INVALID,
							`"${name}" isn't a valid setting name.`,
							{
								plugin: plugin || undefined
							}
						);
					const existing = fields.get(name);
					if (existing)
						throw new XcwdsError(
							codes.SETTINGS_FIELD_EXISTS,
							`The setting "${name}" from "${plugin || 'the app'}" clashes with the one from "${existing.plugin || 'the app'}".`,
							{ plugin: plugin || undefined }
						);
					if (
						typeof definition.parse !== 'function' ||
						definition.parse(definition.default) === undefined
					)
						throw new XcwdsError(
							codes.SETTINGS_FIELD_INVALID,
							`The setting "${name}" needs a parse function that accepts its default.`,
							{ plugin: plugin || undefined }
						);
					fields.set(name, { ...definition, plugin });
					// A field added after loading reads its saved value now.
					const saved = loaded ? storage.read(entry) : undefined;
					const value = saved ? saved[name] : clone(definition.default);
					current = { ...current, [name]: value } as Values;
					if (!loaded) lastSaved = JSON.stringify(current);
				}
			} as SettingsScope;
		}
	};
}
