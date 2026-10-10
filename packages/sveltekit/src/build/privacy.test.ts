import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	checkFindings,
	enforcePrivacy,
	externalOrigin,
	scanDirectories,
	scanText,
	type PluginNetwork
} from './privacy.js';

const origins = (text: string, ext: string) => scanText(text, ext).map((f) => f.origin);

describe('externalOrigin', () => {
	it('reads absolute and protocol-relative URLs, and ignores this origin', () => {
		expect(externalOrigin('https://Example.com/a?b')).toBe('https://example.com');
		expect(externalOrigin('wss://live.example/socket')).toBe('wss://live.example');
		expect(externalOrigin('//cdn.example/x.js')).toBe('https://cdn.example');
		expect(externalOrigin('http://old.example:8080/')).toBe('http://old.example:8080');
		expect(externalOrigin('https://api.example/${id}')).toBe('https://api.example');
		for (const local of ['/a', './b', 'data:image/png;base64,AA', 'blob:x', 'https://${host}/x'])
			expect(externalOrigin(local)).toBeNull();
	});
});

describe('scanText', () => {
	it('finds URLs that JavaScript sends or loads', () => {
		const js = [
			'fetch("https://a.example/x")',
			'fetch(`https://b.example/${id}`)',
			'new Request("https://c.example")',
			'new WebSocket("wss://d.example")',
			'new EventSource("https://e.example/s")',
			'navigator.sendBeacon("https://f.example",d)',
			'x.open("POST","https://g.example/log")',
			'importScripts("https://h.example/w.js")',
			'import("https://i.example/m.js")',
			'import{a}from"https://j.example/m.js"'
		].join(';');
		expect(origins(js, '.js')).toEqual([
			'https://a.example',
			'https://b.example',
			'https://c.example',
			'wss://d.example',
			'https://e.example',
			'https://f.example',
			'https://g.example',
			'https://h.example',
			'https://i.example',
			'https://j.example'
		]);
		expect(scanText('importScripts("https://h.example/w.js")', '.js')[0]?.kind).toBe('script');
	});

	it('ignores URLs that load nothing', () => {
		const js = [
			'const ns="http://www.w3.org/2000/svg"',
			'throw new Error("See https://svelte.dev/e/x")',
			'fetch(url)',
			'fetch("/api")',
			'const a=`<a href="https://example.com">x</a>`',
			'const l=`<link rel="canonical" href="https://example.com">`'
		].join(';');
		expect(origins(js, '.js')).toEqual([]);
	});

	it('finds tags and styles in HTML, including markup Svelte compiled into JavaScript', () => {
		const html = `<!doctype html><head>
<link rel="stylesheet" href="https://fonts.example/css">
<link href='//cdn.example/x.js' rel=modulepreload>
<script src="https://tag.example/t.js"></script>
<style>@font-face{src:url(https://font.example/f.woff2)}</style>
<script>fetch('https://inline.example')</script>
</head><body><img alt="" srcset="/a.png 1x, https://img.example/b.png 2x">
<div style="background:url('https://bg.example/b.png')"></div></body>`;
		expect(scanText(html, '.html').map(({ origin, kind }) => `${kind} ${origin}`)).toEqual([
			'script https://tag.example',
			'other https://img.example',
			'other https://fonts.example',
			'script https://cdn.example',
			'other https://font.example',
			'other https://bg.example',
			'other https://inline.example'
		]);
		expect(
			origins('$.from_html(`<img src=\\"https://img.example/p.gif\\" alt=\\"\\">`)', '.js')
		).toEqual(['https://img.example']);
	});

	it('finds CSS imports and urls', () => {
		const css =
			'@import "https://fonts.example/a.css";@import url(//b.example/c.css);a{background:url("https://c.example/d.png")}b{background:url(/e.png)}';
		expect(origins(css, '.css')).toEqual([
			'https://b.example',
			'https://c.example',
			'https://fonts.example'
		]);
	});
});

describe('checkFindings', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'xcwds-privacy-'));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	async function write(file: string, content: string) {
		await mkdir(dirname(join(dir, file)), { recursive: true });
		await writeFile(join(dir, file), content);
	}

	it('names the plugin whose files contain the origin, and passes declared origins', async () => {
		await write('plugins/bad/client.js', "fetch('https://example.com')");
		await write('plugins/bad/client.test.js', "fetch('https://declared.example')");
		await write('plugins/weather/index.js', "fetch('https://declared.example')");
		await write(
			'out/_app/a.js',
			'fetch("https://example.com");fetch("https://declared.example/f")'
		);
		const plugins: PluginNetwork[] = [
			{ name: 'bad', dir: join(dir, 'plugins/bad'), network: false },
			{
				name: 'weather',
				dir: join(dir, 'plugins/weather'),
				network: { origins: ['https://declared.example'], reason: 'Forecasts' }
			}
		];
		const findings = scanDirectories([join(dir, 'out')]);
		expect(findings.map((f) => f.file)).toEqual(['_app/a.js', '_app/a.js']);
		const problems = checkFindings(findings, plugins, []);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(
			'https://example.com, from plugin "bad" (it declares no network use):'
		);
		expect(problems[0]).toContain('fetch("https://example.com  (_app/a.js)');
		expect(problems[0]).toContain("network: { origins: ['https://example.com'], reason: '...' }");
		expect(() =>
			enforcePrivacy([join(dir, 'out')], plugins, ['https://example.com'])
		).not.toThrow();
		expect(() => enforcePrivacy([join(dir, 'out')], plugins, [])).toThrow(
			'the build contacts an origin that no plugin declares'
		);
	});

	it('never allows scripts from other origins, even declared ones', async () => {
		await write('out/index.html', '<script src="https://cdn.example/lib.js"></script>');
		const problems = checkFindings(
			scanDirectories([join(dir, 'out')]),
			[],
			['https://cdn.example']
		);
		expect(problems[0]).toContain("Scripts only load from the app's own origin");
	});
});

describe('the @xcwds packages', () => {
	it('never phone home', () => {
		const packages = resolve(import.meta.dirname, '../../..');
		const dirs = readdirSync(packages).map((name) => join(packages, name, 'src'));
		// Tests and the scanner's own comments hold examples.
		const findings = scanDirectories(dirs).filter(
			(f) => !/\.test\.ts$/.test(f.file) && f.file !== join('build', 'privacy.ts')
		);
		expect(findings).toEqual([]);
		// It did look: the scanner finds this file's own examples.
		expect(scanDirectories([import.meta.dirname]).length).toBeGreaterThan(10);
	});
});
