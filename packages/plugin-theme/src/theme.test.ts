import { createApp } from '@xcwds/core';
import { buildTestApp, type Importer } from '@xcwds/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import client from './client.js';
import theme, { build } from './index.js';
import { APPLY, COLORS_GLOBAL, applyTheme, resolveOptions, resolveScheme } from './options.js';

afterEach(() => void vi.unstubAllGlobals());

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-theme': () => import('./index.js'),
		'@xcwds/plugin-theme/client': () => import('./client.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

/** `<html>` and the theme-color `<meta>`, enough for the theme to apply to. */
function fakePage() {
	const meta = {
		content: '#light',
		setAttribute: (_: string, v: string) => void (meta.content = v)
	};
	const attributes = new Map<string, string>();
	const document = {
		querySelector: (s: string) => (s === 'meta[name="theme-color"]' ? meta : null)
	};
	const root = {
		style: { colorScheme: '' },
		ownerDocument: document,
		setAttribute: (name: string, value: string) => void attributes.set(name, value),
		get scheme() {
			return attributes.get('data-color-scheme');
		}
	};
	return { root, meta, document: Object.assign(document, { documentElement: root }) };
}

/** `matchMedia('(prefers-color-scheme: dark)')` that the test can flip. */
function fakeMedia(dark: boolean) {
	const media = Object.assign(new EventTarget(), { matches: dark });
	return {
		media,
		matchMedia: vi.fn(() => media),
		set(next: boolean) {
			media.matches = next;
			media.dispatchEvent(new Event('change'));
		}
	};
}

describe('options', () => {
	it('fills in defaults and refuses mistakes', () => {
		expect(resolveOptions()).toEqual({ default: 'system' });
		expect(resolveOptions({ default: 'dark' })).toEqual({ default: 'dark' });
		expect(() => resolveOptions({ default: 'blue' })).toThrow(/`default`/);
		expect(() => resolveOptions({ defualt: 'dark' })).toThrow(/unknown option `defualt`/);
	});

	it('fails the build for bad options', async () => {
		await expect(
			buildTestApp({ plugins: [theme({ default: 'sepia' as never })] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-theme: `default`/);
	});
});

describe('applying a theme', () => {
	const colors = { light: '#light', dark: '#dark' };
	const cases = [
		['system', false],
		['system', true],
		['light', true],
		['dark', false],
		['nonsense', true],
		[undefined, false]
	] as const;

	it.each(cases)('the pre-paint snippet and the page agree: %s, OS dark %s', (value, dark) => {
		const prePaint = fakePage();
		const { matchMedia } = fakeMedia(dark);
		vi.stubGlobal('window', { matchMedia, [COLORS_GLOBAL]: colors });
		vi.stubGlobal('matchMedia', matchMedia);
		vi.stubGlobal('document', prePaint.document);
		new Function('v', 'root', APPLY)(value, prePaint.root);

		const page = fakePage();
		const scheme = applyTheme(value, page.root as never, { prefersDark: dark, colors });
		const expected = resolveScheme(value === 'light' || value === 'dark' ? value : 'system', dark);
		expect(scheme).toBe(expected);
		for (const { root, meta } of [prePaint, page]) {
			expect(root.scheme).toBe(expected);
			expect(root.style.colorScheme).toBe(expected);
			expect(meta.content).toBe(`#${expected}`);
		}
	});

	it('works without matchMedia or the colours', () => {
		const page = fakePage();
		vi.stubGlobal('window', {});
		vi.stubGlobal('document', page.document);
		new Function('v', 'root', APPLY)('system', page.root);
		expect(page.root.scheme).toBe('light');
		expect(page.meta.content).toBe('#light');
	});
});

describe('the build', () => {
	async function head(config: Record<string, unknown>) {
		const app = createApp();
		app.register(build, {});
		await app.ready();
		await app.hooks.reduce('onConfig', config);
		return app.hooks.collect('onHead', []);
	}

	it('hands the brand colours to the page, safe inside a script', async () => {
		expect(
			await head({ brand: { name: 'A', themeColor: { light: '#fff', dark: '#000' } } })
		).toEqual([`window.${COLORS_GLOBAL}={"light":"#fff","dark":"#000"};`]);
		expect(await head({ brand: { name: 'A', themeColor: 'rgb(1,2,3)' } })).toEqual([
			`window.${COLORS_GLOBAL}={"light":"rgb(1,2,3)","dark":"rgb(1,2,3)"};`
		]);
	});
});

describe('the page', () => {
	function browser(dark: boolean) {
		const page = fakePage();
		const os = fakeMedia(dark);
		vi.stubGlobal('window', {
			matchMedia: os.matchMedia,
			[COLORS_GLOBAL]: { light: '#l', dark: '#d' }
		});
		vi.stubGlobal('document', page.document);
		return { ...page, os };
	}

	it('adds the theme setting with a pre-paint snippet', async () => {
		browser(false);
		const app = await buildTestApp({ plugins: [theme({ default: 'dark' })] }, { import: importer });
		expect(app.settings.get().theme).toBe('dark');
		expect(app.settings.fields()).toContainEqual(
			expect.objectContaining({ name: 'theme', section: 'appearance', default: 'dark' })
		);
		expect(app.settings.prePaintScript()).toContain('data-color-scheme');
		expect(() => app.settings.set({ theme: 'blue' as never })).toThrow();
	});

	it('applies the theme on boot, on change and when the OS switches', async () => {
		const { root, meta, os } = browser(false);
		const app = await buildTestApp({ plugins: [[client, {}]] });
		const seen: string[] = [];
		app.theme!.subscribe((scheme) => seen.push(scheme));
		expect(root.scheme).toBe('light');

		os.set(true);
		expect(root.scheme).toBe('dark');
		expect(meta.content).toBe('#d');
		app.settings.set({ theme: 'light' });
		expect(root.scheme).toBe('light');
		// On light, the OS no longer matters.
		os.set(false);
		os.set(true);
		expect(root.scheme).toBe('light');
		app.settings.set({ theme: 'system' });
		expect(app.theme!.scheme).toBe('dark');
		expect(seen).toEqual(['light', 'dark', 'light', 'dark']);

		await app.close();
		os.set(false);
		expect(root.scheme).toBe('dark');
	});
});
