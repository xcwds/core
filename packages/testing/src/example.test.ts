// The kit against a real plugin package: examples/plugin-hello, as examples/minimal configures it.
import hello from '@xcwds-example/plugin-hello';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from './app.js';
import { buildTestWorker } from './worker.js';

const config = { brand: { name: 'Minimal' }, plugins: [hello({ greeting: 'hi' })] };
const importer = (id: string) => import(id);

afterEach(() => void vi.unstubAllGlobals());

describe('examples/plugin-hello', () => {
	it('boots its client entry, with its routes, settings and guards', async () => {
		// Its onBoot hook marks the page.
		const dataset: Record<string, string> = {};
		vi.stubGlobal('document', { documentElement: { dataset } });
		vi.stubGlobal('xcwdsHooks', []);
		const app = await buildTestApp(config, { import: importer, path: '/moved' });
		try {
			expect(app.routes.get('/hello')).toMatchObject({ title: 'Hello', parent: '/' });
			expect(app.path).toBe('/hello');
			// The order examples/minimal's e2e test sees in a browser.
			expect((globalThis as { xcwdsHooks?: string[] }).xcwdsHooks).toEqual([
				'guard /moved -',
				'guard /hello /moved',
				'after /moved',
				'after /hello'
			]);
			expect(dataset).toEqual({ hello: 'hi', path: '/hello' });
			expect(app.settings.get().greeting).toBe('hi');
			expect(await app.navigate('/blocked')).toMatchObject({ path: '/hello', cancelled: true });
			expect(await app.navigate('/slow')).toEqual({
				path: '/hello',
				redirects: ['/hello'],
				cancelled: false
			});
			const second = await app.openTab();
			second.settings.set({ greeting: 'hey' });
			await second.settle();
			expect(app.settings.get().greeting).toBe('hey');
		} finally {
			await app.close();
		}
	});

	it('answers its fetch from the worker entry', async () => {
		const worker = await buildTestWorker(config, {
			import: importer,
			base: '/sub',
			network: () => new Response('from the network')
		});
		const response = await worker.fetch('/__xcwds/hello');
		expect(await response?.text()).toBe('hi from the worker');
		expect(await (await worker.fetch('/hello'))?.text()).toBe('from the network');
		await worker.close();
	});
});
