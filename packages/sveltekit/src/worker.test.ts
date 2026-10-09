import { describe, expect, it } from 'vitest';
import { matchesGlob, precacheList } from './worker.js';

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

describe('the cache policy', () => {
	it('adds extra paths and drops excluded ones from the precache list', () => {
		expect(
			precacheList(
				{
					base: '/sub',
					build: ['/sub/_app/a.js'],
					files: ['/sub/videos/big.mp4', '/sub/videos/2024/clip.mp4', '/sub/robots.txt'],
					prerendered: ['/sub/'],
					assets: []
				},
				{ extra: ['/data.json'], exclude: ['/videos/**'] }
			)
		).toEqual(['/sub/_app/a.js', '/sub/robots.txt', '/sub/', '/sub/data.json']);
	});

	it('matches globs on app paths', () => {
		expect(matchesGlob('/videos/*', '/videos/a.mp4')).toBe(true);
		expect(matchesGlob('/videos/*', '/videos/2024/a.mp4')).toBe(false);
		expect(matchesGlob('/videos/**', '/videos/2024/a.mp4')).toBe(true);
		expect(matchesGlob('/**/*.mp4', '/a.mp4')).toBe(true);
		expect(matchesGlob('/**/*.mp4', '/x/y/a.mp4')).toBe(true);
		expect(matchesGlob('/a.b', '/axb')).toBe(false);
		expect(matchesGlob('/private', '/private')).toBe(true);
		expect(matchesGlob('/private', '/private/x')).toBe(false);
	});
});
