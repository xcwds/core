import { createApp, definePlugin, memoryStorage, XcwdsError } from '@xcwds/core';
import { describe, expect, it } from 'vitest';
import { createRoutes, decorateRoutes, normalizePath, stripBase } from './routes.js';

describe('paths', () => {
	it('normalises paths and strips the base path', () => {
		expect(normalizePath('/a/b/')).toBe('/a/b');
		expect(normalizePath('')).toBe('/');
		expect(normalizePath('//a//b')).toBe('/a/b');
		expect(stripBase('/sub/hello', '/sub')).toBe('/hello');
		expect(stripBase('/sub', '/sub')).toBe('/');
		expect(stripBase('/subway', '/sub')).toBeNull();
		expect(stripBase('/hello', '')).toBe('/hello');
	});
});

describe('the route registry', () => {
	it('adds routes under a prefix and finds them with or without a trailing slash', () => {
		const routes = createRoutes();
		routes.add({ path: '/', title: 'Timer', parent: '/utils/' }, 'timers', '/utils/timer');
		expect(routes.get('/utils/timer/')).toEqual({
			path: '/utils/timer',
			title: 'Timer',
			parent: '/utils',
			plugin: 'timers'
		});
		expect(routes.list()).toHaveLength(1);
		expect(createRoutes(routes.list()).get('/utils/timer')?.plugin).toBe('timers');
	});

	it('rejects invalid and duplicate routes, naming the plugins', () => {
		const routes = createRoutes();
		routes.add({ path: '/a', title: 'A' }, 'one');
		expect(() => routes.add({ path: '/a/', title: 'B' }, 'two')).toThrow(
			'The route "/a" from "two" is already added by "one".'
		);
		expect(() => routes.add({ path: 'a', title: 'A' })).toThrow(XcwdsError);
		expect(() => routes.add({ path: '/b?x=1', title: 'B' })).toThrow('query or hash');
		expect(() => routes.add({ path: '/b', title: ' ' })).toThrow('needs a title');
		expect(() => routes.add({ path: '/b', title: 'B', width: 'huge' as never })).toThrow(
			'"narrow" or "wide"'
		);
		expect(() => routes.add({ path: '/b', title: 'B', parent: 'x' })).toThrow('parent');
	});

	it("records each plugin's name and prefix through app.route()", async () => {
		const app = createApp({ storage: memoryStorage(), logLevel: 'silent' });
		decorateRoutes(app);
		app.register(
			definePlugin((a) => void a.route({ path: '/', title: 'Timer', emoji: '⏱️' }), {
				name: '@xcwds/plugin-timers'
			}),
			{ prefix: '/utils/timer' }
		);
		app.register(definePlugin((a) => void a.route({ path: '/about', title: 'About' })));
		await app.ready();
		expect(app.routes.list().map((r) => [r.path, r.plugin])).toEqual([
			['/utils/timer', '@xcwds/plugin-timers'],
			['/about', 'anonymous plugin']
		]);
	});
});
