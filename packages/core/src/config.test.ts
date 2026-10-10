import { describe, expect, it } from 'vitest';
import {
	createManifest,
	defineConfig,
	descriptor,
	headTags,
	resolveConfig,
	validateConfig,
	type ResolvedConfig
} from './config.js';
import { codes } from './errors.js';

const timers = descriptor<{ prefix?: string }>('@xcwds/plugin-timers');

function resolved(input: unknown): ResolvedConfig {
	const r = validateConfig(input);
	if (!r.ok) throw new Error(JSON.stringify(r.issues));
	return r.config;
}

describe('validateConfig', () => {
	it('needs only a name, and fills in defaults', () => {
		expect(resolved(defineConfig({ brand: { name: 'Pocketbox' } }))).toEqual({
			brand: {
				name: 'Pocketbox',
				shortName: 'Pocketbox',
				tagline: '',
				description: '',
				icon: undefined,
				themeColor: { light: '#ffffff', dark: '#111111' },
				backgroundColor: '#ffffff',
				lang: 'en'
			},
			manifest: {},
			storage: { prefix: 'app:', appName: 'Pocketbox' },
			privacy: { allowOrigins: [] },
			plugins: []
		});
	});

	it('turns plugin factories into descriptors', () => {
		const config = resolved({ brand: { name: 'P' }, plugins: [timers({ prefix: '/t' })] });
		expect(config.plugins).toEqual([{ name: '@xcwds/plugin-timers', options: { prefix: '/t' } }]);
	});

	it('reports every problem with its key path', () => {
		const r = validateConfig(
			{
				brand: { tagline: 3, icon: 'icon.png', themeColor: { dark: 'not a colour!' }, colour: 'x' },
				storage: { prefix: 'app', appName: ' ' },
				privacy: {
					allowOrigins: ['http://example.com', 'https://example.com/path', 'https://ok.example']
				},
				plugins: [timers, { name: 'x', options: { onClick: () => {} } }, timers(), timers()],
				extra: true
			},
			{ fileExists: () => false }
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.issues.map((i) => i.path)).toEqual([
			'extra',
			'brand.name',
			'brand.tagline',
			'brand.icon',
			'brand.themeColor.light',
			'brand.themeColor.dark',
			'brand.colour',
			'storage.prefix',
			'storage.appName',
			'privacy.allowOrigins[0]',
			'privacy.allowOrigins[1]',
			'plugins[0]',
			'plugins[1].options.onClick',
			'plugins[3]'
		]);
		expect(r.issues.find((i) => i.path === 'plugins[0]')?.message).toContain('call it');
	});

	it('checks the icon exists', () => {
		const r = validateConfig(
			{ brand: { name: 'P', icon: 'icon.svg' } },
			{ fileExists: () => false }
		);
		expect(r.ok ? [] : r.issues).toEqual([
			{ path: 'brand.icon', message: 'file not found: icon.svg' }
		]);
	});

	it('throws one readable error from resolveConfig', () => {
		expect(() => resolveConfig({ brand: {} })).toThrowError(
			expect.objectContaining({
				code: codes.CONFIG_INVALID,
				message: expect.stringContaining('brand.name: is required')
			})
		);
	});
});

describe('createManifest', () => {
	const config = resolved({
		brand: {
			name: 'Pocketbox Tools',
			shortName: 'Pocketbox',
			tagline: 'Tools that stay on your phone.',
			icon: 'icon.svg',
			themeColor: { light: '#bfdbfe', dark: '#030712' }
		},
		manifest: { display: 'fullscreen', shortcuts: [] }
	});

	it('builds an installable manifest, merging `manifest` last', () => {
		const m = createManifest(config);
		expect(m).toMatchObject({
			name: 'Pocketbox Tools',
			short_name: 'Pocketbox',
			description: 'Tools that stay on your phone.',
			id: '/',
			start_url: '/',
			scope: '/',
			display: 'fullscreen',
			theme_color: '#bfdbfe',
			background_color: '#bfdbfe',
			shortcuts: []
		});
		expect(
			(m.icons as { purpose?: string }[]).filter((i) => i.purpose === 'maskable')
		).toHaveLength(1);
	});

	it('puts everything under the base path', () => {
		const m = createManifest(config, { base: '/repo' });
		expect([m.id, m.start_url, m.scope]).toEqual(['/repo/', '/repo/', '/repo/']);
		expect((m.icons as { src: string }[]).every((i) => i.src.startsWith('/repo/icons/'))).toBe(
			true
		);
		expect(() => createManifest(config, { base: '/repo/' })).toThrow();
		expect(() => createManifest(config, { base: 'repo' })).toThrow();
	});

	it('leaves icons out without an icon', () => {
		expect(createManifest(resolved({ brand: { name: 'P' } })).icons).toBeUndefined();
	});
});

describe('headTags', () => {
	it('escapes values and honours the base path', () => {
		const html = headTags(resolved({ brand: { name: 'A "quoted" <app>', icon: 'i.svg' } }), {
			base: '/repo'
		});
		expect(html).toContain('<link rel="manifest" href="/repo/manifest.webmanifest" />');
		expect(html).toContain('content="A &quot;quoted&quot; &lt;app&gt;"');
		expect(html).toContain(
			'<link rel="apple-touch-icon" href="/repo/icons/apple-touch-icon.png" />'
		);
		expect(html).not.toContain('<app>');
	});
});
