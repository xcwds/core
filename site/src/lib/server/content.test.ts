import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiOf } from './api.js';
import { pages, ROOT, source } from './pages.js';
import { linkTarget, render, slugger } from './render.js';

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

describe('pages', () => {
	it('render, and every relative link in them leads somewhere', () => {
		expect(pages().length).toBeGreaterThan(15);
		for (const page of pages()) {
			// render() throws on a link to a file that doesn't exist.
			const { html, headings } = render(source(page), page.file, '');
			expect(html, page.file).not.toContain('<h1');
			// Links to a heading on this page find it.
			for (const [, id] of html.matchAll(/href="#([^"]+)"/g))
				expect(
					headings.map((h) => h.id),
					`${page.file} #${id}`
				).toContain(id);
		}
	});

	it('link to a heading on another page only when it exists', () => {
		const ids = new Map(
			pages().map((p) => [p.path, render(source(p), p.file, '').headings.map((h) => h.id)])
		);
		for (const page of pages())
			for (const [, path, id] of render(source(page), page.file, '').html.matchAll(
				/href="(\/(?:docs|reference)\/[^"#]+)#([^"]+)"/g
			))
				expect(ids.get(path!), `${page.file} → ${path}#${id}`).toContain(id);
	});
});

describe('links', () => {
	it('go to the page for a file, or to the file on GitHub', () => {
		expect(linkTarget('concepts.md#hooks', 'docs/plugin-guide.md', '/core')).toBe(
			'/core/docs/concepts#hooks'
		);
		expect(linkTarget('../packages/testing', 'docs/plugin-guide.md', '')).toBe(
			'/reference/testing'
		);
		expect(linkTarget('../sveltekit', 'packages/plugin-shell/README.md', '')).toBe(
			'/reference/sveltekit'
		);
		expect(linkTarget('../examples/plugin-tally', 'docs/plugin-guide.md', '')).toBe(
			'https://github.com/xcwds/xcwds/blob/main/examples/plugin-tally'
		);
		expect(linkTarget('https://fastify.dev', 'docs/concepts.md', '')).toBe('https://fastify.dev');
		expect(() => linkTarget('missing.md', 'docs/concepts.md', '')).toThrow(/doesn't exist/);
	});

	it('use GitHub’s heading ids', () => {
		const slug = slugger();
		expect(slug('8. Use it in an app')).toBe('8-use-it-in-an-app');
		expect(slug('`app.tally` and settings')).toBe('apptally-and-settings');
		expect(slug('Options')).toBe('options');
		expect(slug('Options')).toBe('options-1');
	});
});

describe('the plugin guide', () => {
	it('shows the example plugin’s files as they are', () => {
		const guide = read('docs/plugin-guide.md');
		const blocks = [
			...guide.matchAll(
				/<!-- file: (\S+) -->\n(?:<!-- prettier-ignore -->\n|\n)```\w+\n([\s\S]*?)```\n/g
			)
		];
		expect(blocks.map(([, file]) => file)).toEqual([
			'examples/plugin-tally/package.json',
			'examples/plugin-tally/src/options.ts',
			'examples/plugin-tally/src/index.ts',
			'examples/plugin-tally/src/tally.ts',
			'examples/plugin-tally/src/client.ts',
			'examples/plugin-tally/src/Tally.svelte',
			'examples/plugin-tally/src/tally.test.ts'
		]);
		for (const [, file, code] of blocks)
			expect(code, `${file} changed: copy it into docs/plugin-guide.md`).toBe(read(file!));
	});
});

describe('the ecosystem page', () => {
	it('lists every first-party plugin', () => {
		const page = read('docs/ecosystem.md');
		const plugins = pages()
			.filter((p) => p.path.startsWith('/reference/plugin-'))
			.map((p) => p.title);
		expect(plugins.length).toBeGreaterThan(5);
		for (const name of plugins) expect(page).toContain(`[\`${name}\`]`);
	});
});

describe('the reference', () => {
	it('reads options, decorators and settings from the types', () => {
		const api = apiOf('examples/plugin-tally');
		expect(api.options?.name).toBe('TallyOptions');
		expect(api.options?.members.map((m) => [m.name, m.type, m.optional])).toEqual([
			['path', 'string', true],
			['step', 'number', true]
		]);
		expect(api.options?.members[0]?.doc).toBe('The tally page, an app path. Default `/tally`.');
		expect(api.app).toMatchObject([
			{
				name: 'tally',
				type: 'AppTally',
				optional: true,
				members: [{ name: 'entry', type: 'Entry<Tally>' }]
			}
		]);
		expect(api.settings).toMatchObject([{ name: 'tallyStep', type: 'number', optional: false }]);
	});

	it('expands methods and nested types', () => {
		const api = apiOf('packages/plugin-timers');
		const timers = api.app.find((m) => m.name === 'timers');
		expect(timers?.members?.find((m) => m.name === 'create')).toMatchObject({
			type: '(label: string, ms: number) => TimerItem | undefined'
		});
	});
});
