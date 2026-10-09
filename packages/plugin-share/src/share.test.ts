import { createApp, definePlugin } from '@xcwds/core';
import { buildTestApp, buildTestWorker, type Importer } from '@xcwds/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import shellClient from '@xcwds/plugin-shell/client';
import client, { readShared } from './client.js';
import shareFactory, { build } from './index.js';
import { fromFragment, fromQuery, resolveOptions, toFragment } from './options.js';
import { share, shareData } from './share.js';
import worker from './worker.js';

afterEach(() => void vi.unstubAllGlobals());
// The button needs SvelteKit's runtime; e2e tests cover it.
vi.mock('./ShareButton.svelte', () => ({ default: function ShareButton() {} }));

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-share': () => import('./index.js'),
		'@xcwds/plugin-share/client': () => import('./client.js'),
		'@xcwds/plugin-share/worker': () => import('./worker.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

describe('options', () => {
	it('fills in defaults and refuses mistakes', async () => {
		expect(resolveOptions()).toEqual({ target: null, exclude: ['/settings'] });
		expect(resolveOptions({ target: '/inbox', exclude: [] })).toEqual({
			target: '/inbox',
			exclude: []
		});
		expect(() => resolveOptions({ target: '/' })).toThrow(/`target`/);
		expect(() => resolveOptions({ target: '/inbox?x' })).toThrow(/`target`/);
		expect(() => resolveOptions({ exclude: 'settings' })).toThrow(/`exclude`/);
		expect(() => resolveOptions({ targte: '/x' })).toThrow(/unknown option `targte`/);
		await expect(
			buildTestApp({ plugins: [shareFactory({ target: 'inbox' })] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-share: `target`/);
	});
});

describe('shared content', () => {
	it('joins the fields, link first, and moves them to the fragment and back', () => {
		const shared = fromQuery(
			new URLSearchParams({ title: 'A page', text: 'Look https://x.example/?a=1 &b', url: '' })
		)!;
		expect(shared).toEqual({
			joined: 'Look https://x.example/?a=1 &b A page',
			text: 'Look https://x.example/?a=1 &b',
			title: 'A page'
		});
		expect(fromFragment(toFragment(shared))).toEqual(shared);
		expect(fromQuery(new URLSearchParams('q=1'))).toBeNull();
		expect(fromQuery(new URLSearchParams('url=%20'))).toBeNull();
	});

	it("reads the iPhone Shortcut's #url= and ignores other fragments", () => {
		expect(fromFragment('#url=https%3A%2F%2Fx.example%2F%3Fa%3D1')).toEqual({
			joined: 'https://x.example/?a=1'
		});
		// Decoded whole, like the app it came from: a raw & or + stays part of the link.
		expect(fromFragment('#url=https://x.example/?a=1&b=2+3')).toEqual({
			joined: 'https://x.example/?a=1&b=2+3'
		});
		expect(fromFragment('#url=https://x.example/%E0%A4%A')).toEqual({
			joined: 'https://x.example/%E0%A4%A'
		});
		expect(fromFragment('#section')).toBeNull();
		expect(fromFragment('#url=')).toBeNull();
		expect(fromFragment('')).toBeNull();
	});

	it('round-trips fields holding &, +, = and url=', () => {
		const shared = {
			joined: 'a&url=b+c https://x.example/?q=a+b&r=1',
			text: 'a&url=b+c',
			url: 'https://x.example/?q=a+b&r=1'
		};
		const fragment = toFragment(shared);
		expect(fragment.startsWith('#shared.url=')).toBe(true);
		expect(fromFragment(fragment)).toEqual(shared);
	});

	it('prefers the fragment, and falls back to the query', () => {
		expect(readShared(new URL('https://a.example/inbox?text=q#url=f'))?.joined).toBe('f');
		expect(readShared(new URL('https://a.example/inbox?text=q'))?.joined).toBe('q');
		expect(readShared(new URL('https://a.example/inbox'))).toBeNull();
	});
});

describe('the Share button', () => {
	const at = (path: string, base = '') =>
		shareData(path, {
			origin: 'https://a.example',
			base,
			title: path === '/' ? undefined : 'Timer',
			appName: 'My app',
			tagline: 'Everyday tools.',
			exclude: ['/settings', '/private']
		});

	it('shares the origin, base path and path only', () => {
		expect(at('/')).toEqual({
			title: 'My app',
			text: 'My app: Everyday tools.',
			url: 'https://a.example/'
		});
		expect(at('/utils/timer/', '/sub')).toEqual({
			title: 'Timer',
			text: 'Timer on My app',
			url: 'https://a.example/sub/utils/timer'
		});
		expect(at('/', '/sub')!.url).toBe('https://a.example/sub/');
	});

	it('never shares excluded or private pages', () => {
		expect(at('/settings')).toBeNull();
		const options = {
			origin: 'https://a.example',
			base: '',
			title: 'Cycle',
			appName: 'A',
			tagline: ''
		};
		expect(shareData('/utils/cycle', { ...options, exclude: [], private: true })).toBeNull();
		expect(shareData('/utils/cycle', { ...options, exclude: [], private: false })).not.toBeNull();
		expect(at('/private/notes')).toBeNull();
		expect(at('/privately')).not.toBeNull();
	});

	it('shares, copies when it can’t, and treats closing the sheet as fine', async () => {
		const data = { title: 'T', text: 'T on A', url: 'https://a.example/t' };
		const copied: string[] = [];
		const clipboard = { writeText: async (s: string) => void copied.push(s) } as Clipboard;
		const shared: ShareData[] = [];
		type ShareData = typeof data;
		expect(
			await share(data, { share: async (d) => void shared.push(d as ShareData), clipboard })
		).toBe('shared');
		expect(shared).toEqual([data]);
		const abort = async () => {
			throw new DOMException('closed', 'AbortError');
		};
		expect(await share(data, { share: abort, clipboard })).toBe('cancelled');
		const refuse = async () => {
			throw new DOMException('no', 'NotAllowedError');
		};
		expect(await share(data, { share: refuse, clipboard })).toBe('copied');
		expect(await share(data, { share: undefined as never, clipboard })).toBe('copied');
		expect(copied).toEqual([data.url, data.url]);
		const broken = { writeText: () => Promise.reject(new Error('denied')) } as unknown as Clipboard;
		expect(await share(data, { share: undefined as never, clipboard: broken })).toBe('failed');
	});

	it("joins the shell's header once the app boots, and leaves on close", async () => {
		vi.stubGlobal('document', { documentElement: { setAttribute() {} } });
		const app = await buildTestApp({
			plugins: [
				[shellClient, {}],
				[client, {}]
			]
		});
		await vi.waitFor(() => expect(app.shell!.header.list()).toHaveLength(1));
		expect(app.shell!.header.list()[0]!.order).toBe(100);
		await app.close();
		expect(app.shell!.header.list()).toHaveLength(0);
	});

	it('says so with a toast when it copied', async () => {
		const toasts: string[] = [];
		vi.stubGlobal('navigator', { clipboard: { writeText: async () => {} } });
		const toaster = definePlugin(
			(a) => void a.decorate('toast', (message: string) => void toasts.push(message)),
			{ name: 'toaster', encapsulate: false }
		);
		const app = await buildTestApp({ plugins: [toaster, [client, {}]] });
		expect(await app.share!.share({ title: 'T', text: 'T', url: 'https://a.example/' })).toBe(
			'copied'
		);
		expect(toasts).toEqual(['Link copied.']);
		expect(app.shared).toBeUndefined();
	});
});

describe('the share target', () => {
	it('adds a GET share_target to the manifest, under the base path', async () => {
		const app = createApp();
		app.register(build, { target: '/inbox' });
		await app.ready();
		const manifest = await app.hooks.reduce('onManifest', { name: 'A', scope: '/sub/' });
		expect(manifest).toEqual({
			name: 'A',
			scope: '/sub/',
			share_target: {
				action: '/sub/inbox',
				method: 'GET',
				enctype: 'application/x-www-form-urlencoded',
				params: { url: 'url', text: 'text', title: 'title' }
			}
		});
		const none = createApp();
		none.register(build, {});
		await none.ready();
		expect(await none.hooks.reduce('onManifest', { name: 'A' })).toEqual({ name: 'A' });
	});

	it('moves a share from the query to the fragment before it leaves the device', async () => {
		const requests: string[] = [];
		const sw = await buildTestWorker(
			{ plugins: [[worker, { target: '/inbox' }]] },
			{
				base: '/sub',
				network: (request) => {
					requests.push(request.url);
					return new Response('page');
				}
			}
		);
		const response = (await sw.fetch('/inbox?title=T&text=secret%20https%3A%2F%2Fx.example', {
			mode: 'navigate'
		}))!;
		expect(response.status).toBe(303);
		const location = new URL(response.headers.get('location')!);
		expect(location.pathname + location.search).toBe('/sub/inbox');
		expect(fromFragment(location.hash)).toEqual({
			joined: 'secret https://x.example T',
			text: 'secret https://x.example',
			title: 'T'
		});
		expect(requests).toEqual([]);

		// Anything else goes on as usual.
		for (const path of ['/inbox', '/inbox?q=1', '/other?text=x'])
			expect((await sw.fetch(path, { mode: 'navigate' }))?.status, path).not.toBe(303);
		expect((await sw.fetch('/inbox?text=x'))?.status).not.toBe(303);
	});

	it('hands the page what was shared once, and clears it from the address', async () => {
		const events = new EventTarget();
		const location = {
			href: 'https://a.example/inbox?text=from%20the%20query',
			pathname: '/inbox'
		};
		const replaced: string[] = [];
		vi.stubGlobal('location', location);
		vi.stubGlobal('history', {
			state: null,
			replaceState: (_: unknown, __: string, url: string) => {
				replaced.push(url);
				location.href = `https://a.example${url}`;
			}
		});
		vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
		vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
		const app = await buildTestApp({ plugins: [[client, { target: '/inbox' }]] });
		const seen: string[] = [];
		const stop = app.shared!.listen((shared) => seen.push(shared.joined));
		expect(seen).toEqual(['from the query']);
		expect(replaced).toEqual(['/inbox']);

		// Safari reusing the tab: only the hash changes.
		location.href = 'https://a.example/inbox#url=again';
		events.dispatchEvent(new Event('hashchange'));
		expect(seen).toEqual(['from the query', 'again']);
		stop();
		location.href = 'https://a.example/inbox#url=later';
		events.dispatchEvent(new Event('hashchange'));
		expect(seen).toHaveLength(2);
	});
});
