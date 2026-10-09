import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic } from './static-server.js';

let root: string;
let dir: string;
beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'xcwds-static-'));
	dir = join(root, 'build');
	await mkdir(join(dir, 'docs'), { recursive: true });
	await writeFile(join(dir, 'index.html'), 'home');
	await writeFile(join(dir, 'hello.html'), 'hello');
	await writeFile(join(dir, 'docs', 'index.html'), 'docs');
	await writeFile(join(dir, '404.html'), 'not found');
	await writeFile(join(dir, 'app.js'), 'js');
	await writeFile(join(dir, 'app.wasm'), 'wasm');
	// Beside the build: must never be served.
	await writeFile(join(root, 'build.html'), 'secret');
	await writeFile(join(root, 'secret.txt'), 'secret');
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function get(url: string) {
	const res = await fetch(url);
	return [res.status, await res.text(), res.headers.get('content-type')] as const;
}

describe('serveStatic', () => {
	it('serves pages the way GitHub Pages does', async () => {
		const server = await serveStatic(dir);
		expect(await get(server.url('/'))).toEqual([200, 'home', 'text/html']);
		expect(await get(server.url('/hello'))).toEqual([200, 'hello', 'text/html']);
		expect(await get(server.url('docs/'))).toEqual([200, 'docs', 'text/html']);
		expect(await get(server.url('/app.js'))).toEqual([200, 'js', 'text/javascript']);
		expect(await get(server.url('/app.wasm'))).toEqual([200, 'wasm', 'application/wasm']);
		expect(await get(server.url('/nope'))).toEqual([404, 'not found', 'text/html']);
		await server.close();
	});

	it('serves under a base path only', async () => {
		const server = await serveStatic(dir, { base: '/sub' });
		expect(server.url('/hello')).toBe(`${server.origin}/sub/hello`);
		expect((await get(server.url('/hello')))[1]).toBe('hello');
		expect((await get(`${server.origin}/sub`))[1]).toBe('home');
		expect((await get(`${server.origin}/hello`))[0]).toBe(404);
		expect((await get(`${server.origin}/subway`))[0]).toBe(404);
		await server.close();
		await expect(serveStatic(dir, { base: 'sub/' })).rejects.toThrow(/base path/);
	});

	it('never serves files outside the directory', async () => {
		const server = await serveStatic(dir);
		for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/']) {
			const [, body] = await get(`${server.origin}${path}`);
			expect(body).not.toBe('secret');
		}
		// `/` must not find `build.html` beside the directory.
		expect((await get(`${server.origin}/%2e%2e/build`))[1]).toBe('not found');
		expect((await get(`${server.origin}/%E0%A4%A`))[0]).toBe(404);
		await server.close();
	});
});
