import { describe, expect, it } from 'vitest';
import { precacheList } from './worker.js';

describe('precacheList', () => {
	it('lists each path once, so cache.addAll() never sees a duplicate', () => {
		expect(
			precacheList({
				base: '/sub',
				build: ['/sub/_app/a.js'],
				files: ['/sub/manifest.webmanifest', '/sub/robots.txt'],
				prerendered: ['/sub/', '/sub/hello'],
				assets: ['manifest.webmanifest', 'favicon.ico']
			})
		).toEqual([
			'/sub/_app/a.js',
			'/sub/manifest.webmanifest',
			'/sub/robots.txt',
			'/sub/',
			'/sub/hello',
			'/sub/favicon.ico'
		]);
	});
});
