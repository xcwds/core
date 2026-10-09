import { describe, expect, it, vi } from 'vitest';
import { codes } from './errors.js';
import { createSettings } from './settings.js';
import { createStorage, memoryStorage } from './storage.js';

type Theme = 'system' | 'light' | 'dark';
const isTheme = (v: unknown) =>
	v === 'system' || v === 'light' || v === 'dark' ? (v as Theme) : undefined;

function setup(initial: Record<string, string> = {}) {
	const adapter = memoryStorage(initial);
	const storage = createStorage({ adapter, onError: vi.fn() });
	const settings = createSettings(storage);
	const theme = settings.scope('@xcwds/plugin-theme');
	theme.field<Theme>('theme', {
		default: 'system',
		parse: isTheme,
		section: 'appearance',
		prePaint:
			"if(v==='light'||v==='dark'||v==='system')root.dataset.colorScheme=v==='system'?'auto':v;"
	});
	settings.scope('timers').field<number[]>('presets', {
		default: [1, 5],
		parse: (v) => (Array.isArray(v) && v.every((n) => typeof n === 'number') ? v : undefined)
	});
	return { adapter, storage, settings };
}

describe('settings', () => {
	it('starts from defaults and loads saved values, defaulting invalid or missing fields', () => {
		const { settings } = setup({ 'app:settings': '{"theme":"neon","extra":{"kept":true}}' });
		expect(settings.ready()).toBe(false);
		expect(settings.get()).toEqual({ theme: 'system', presets: [1, 5] });
		settings.load();
		expect(settings.ready()).toBe(true);
		expect(settings.get()).toEqual({ theme: 'system', presets: [1, 5], extra: { kept: true } });
	});

	it('refuses clashing or invalid fields, naming both plugins', () => {
		const { settings } = setup();
		expect(() =>
			settings.scope('other').field('theme', { default: 'x', parse: (v) => v as string })
		).toThrowError(
			expect.objectContaining({
				code: codes.SETTINGS_FIELD_EXISTS,
				message: expect.stringMatching(/"other".*"@xcwds\/plugin-theme"/)
			})
		);
		expect(() => settings.scope('p').field('bad name', { default: 1, parse: () => 1 })).toThrow();
		expect(() =>
			settings.scope('p').field('n', { default: 'x', parse: () => undefined })
		).toThrowError(expect.objectContaining({ code: codes.SETTINGS_FIELD_INVALID }));
	});

	it('validates changes and notifies subscribers', () => {
		const { settings } = setup();
		settings.load();
		const listener = vi.fn();
		settings.subscribe(listener);
		settings.set({ theme: 'dark' });
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({ theme: 'dark' }),
			expect.objectContaining({ theme: 'system' })
		);
		settings.set({ theme: 'dark' });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(() => settings.set({ theme: 'neon' })).toThrowError(
			expect.objectContaining({ code: codes.SETTINGS_FIELD_INVALID })
		);
		expect(() => settings.set({ nope: 1 })).toThrow();
		settings.update((s) => ({ presets: [...(s.presets as number[]), 10] }));
		expect(settings.get().presets).toEqual([1, 5, 10]);
	});

	it('saves only once something differs from the defaults', () => {
		const { settings, adapter } = setup();
		settings.load();
		settings.reset();
		expect(adapter.data.has('app:settings')).toBe(false);
		settings.set({ theme: 'light' });
		expect(JSON.parse(adapter.data.get('app:settings')!)).toEqual({
			theme: 'light',
			presets: [1, 5]
		});
		// Back to the defaults is still saved, since the user chose it.
		settings.set({ theme: 'system' });
		expect(JSON.parse(adapter.data.get('app:settings')!).theme).toBe('system');
	});

	it('keeps fields of plugins that aren’t registered right now', () => {
		const { settings, adapter } = setup({ 'app:settings': '{"gone":42}' });
		settings.load();
		settings.set({ theme: 'dark' });
		expect(JSON.parse(adapter.data.get('app:settings')!).gone).toBe(42);
	});

	it('reports the real result of an explicit save', () => {
		const adapter = memoryStorage();
		const storage = createStorage({ adapter, onError: vi.fn() });
		const settings = createSettings(storage);
		settings.load();
		expect(settings.save()).toBe(true);
		adapter.set = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		const failed = vi.fn();
		storage.onSaveFailure(failed);
		expect(settings.save()).toBe(false);
		expect(failed).toHaveBeenCalledWith(expect.anything(), { explicit: true });
	});

	it('reloads when another tab saves settings, or clears everything', () => {
		const { settings, storage, adapter } = setup();
		settings.load();
		const target = new EventTarget();
		storage.startSync(target);
		const fire = (key: string | null) => {
			const event = new Event('storage');
			Object.defineProperty(event, 'key', { value: key });
			target.dispatchEvent(event);
		};
		adapter.set('app:settings', '{"theme":"dark"}');
		fire('app:settings');
		expect(settings.get().theme).toBe('dark');
		adapter.data.clear();
		fire(null);
		expect(settings.get().theme).toBe('system');
	});

	it('reads the saved value of a field added after loading', () => {
		const { settings } = setup({ 'app:settings': '{"late":"x"}' });
		settings.load();
		settings
			.scope('late')
			.field('late', { default: 'd', parse: (v) => (typeof v === 'string' ? v : undefined) });
		expect(settings.get().late).toBe('x');
	});

	it('loads saved settings before a change, so it never saves defaults over them', () => {
		const { settings, adapter } = setup({ 'app:settings': '{"theme":"dark","presets":[3]}' });
		settings.set({ presets: [2] });
		expect(JSON.parse(adapter.data.get('app:settings')!)).toEqual({ theme: 'dark', presets: [2] });
		expect(settings.ready()).toBe(true);
	});

	it('lists fields with their plugin and section', () => {
		const { settings } = setup();
		expect(settings.fields()).toEqual([
			{
				name: 'theme',
				plugin: '@xcwds/plugin-theme',
				label: 'theme',
				hint: undefined,
				section: 'appearance',
				control: undefined,
				default: 'system'
			},
			{
				name: 'presets',
				plugin: 'timers',
				label: 'presets',
				hint: undefined,
				section: 'general',
				control: undefined,
				default: [1, 5]
			}
		]);
	});

	it('carries a control and hint for settings pages, and refuses unknown controls', () => {
		const { settings } = setup();
		const scope = settings.scope('p');
		const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
		scope.field('sound', {
			default: true,
			parse: bool,
			label: 'Sound',
			hint: 'Beep when done.',
			control: { type: 'switch' }
		});
		expect(settings.fields().find((f) => f.name === 'sound')).toMatchObject({
			hint: 'Beep when done.',
			control: { type: 'switch' }
		});
		expect(() =>
			scope.field('odd', { default: true, parse: bool, control: { type: 'slider' } as never })
		).toThrow(/unknown control/);
		const bad: unknown[] = [
			{ type: 'choice' },
			{ type: 'choice', options: [] },
			{ type: 'choice', options: [{ value: {}, label: 'x' }] },
			{ type: 'switches', options: [{ key: 'a' }] },
			{ type: 'number', min: 0 },
			{ type: 'number', min: 5, max: 1 },
			{ type: 'number', min: 0, max: 1, step: 0 },
			{ type: 'number', min: 0, max: 1, unit: 3 },
			null
		];
		bad.forEach((control, i) =>
			expect(() =>
				scope.field(`bad${i}`, { default: true, parse: bool, control: control as never })
			).toThrow(/setting "bad\d+" (needs|has an unknown)/)
		);
		scope.field('n', {
			default: 1,
			parse: (v) => (typeof v === 'number' ? v : undefined),
			control: { type: 'number', min: 0, max: 2, step: 0.5, unit: 'x' }
		});
	});

	describe('pre-paint script', () => {
		function run(script: string, saved: string | null | (() => never)) {
			const dataset: Record<string, string> = {};
			const localStorage = {
				getItem: () => (typeof saved === 'function' ? saved() : saved)
			};
			new Function('localStorage', 'document', script)(localStorage, {
				documentElement: { dataset }
			});
			return dataset;
		}

		it('applies saved values, falls back to defaults, and survives blocked storage', () => {
			const script = setup().settings.prePaintScript();
			expect(run(script, '{"theme":"dark"}')).toEqual({ colorScheme: 'dark' });
			expect(run(script, null)).toEqual({ colorScheme: 'auto' });
			expect(run(script, 'null')).toEqual({ colorScheme: 'auto' });
			expect(run(script, '{corrupt')).toEqual({ colorScheme: 'auto' });
			expect(
				run(script, () => {
					throw new Error('SecurityError');
				})
			).toEqual({ colorScheme: 'auto' });
		});

		it('keeps one failing snippet from stopping the others', () => {
			const { settings } = setup();
			settings.scope('p').field('a', { default: 1, parse: () => 1, prePaint: 'throw 1;' });
			settings
				.scope('q')
				.field('b', { default: 'y', parse: (v) => v as string, prePaint: 'root.dataset.b=v;' });
			expect(run(settings.prePaintScript(), '{}')).toEqual({ colorScheme: 'auto', b: 'y' });
		});

		it('escapes values that could end the inline script', () => {
			const { settings } = setup();
			settings.scope('p').field('label', {
				default: '</script><img src=x>\u2028',
				parse: (v) => (typeof v === 'string' ? v : undefined),
				prePaint: 'root.dataset.label=v;'
			});
			const script = settings.prePaintScript();
			expect(script).not.toContain('</script');
			expect(script).not.toContain('\u2028');
			expect(run(script, null).label).toBe('</script><img src=x>\u2028');
		});

		it('is empty when no field has a snippet', () => {
			const storage = createStorage({ adapter: memoryStorage() });
			expect(createSettings(storage).prePaintScript()).toBe('');
		});
	});
});
