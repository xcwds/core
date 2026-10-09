import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveDeployment } from './deploy.js';

let build: string;
beforeAll(async () => {
	build = await mkdtemp(join(tmpdir(), 'xcwds-build-'));
	await mkdir(join(build, '_app'), { recursive: true });
	await mkdir(join(build, 'docs'), { recursive: true });
	await writeFile(join(build, '_app', 'version.json'), '{"version":"111"}');
	await writeFile(join(build, 'service-worker.js'), 'const v = "111"; const w = "111";');
	await writeFile(join(build, 'index.html'), '<html><head><title>x</title></head></html>');
	await writeFile(join(build, 'docs', 'index.html'), '<html><head></head></html>');
});
afterAll(() => rm(build, { recursive: true, force: true }));

describe('serveDeployment', () => {
	it('serves a copy and deploys fake new versions into it', async () => {
		const deployment = await serveDeployment(build, { base: '/sub' });
		expect(deployment.version).toBe('111');
		expect(await (await fetch(deployment.url('/'))).text()).toContain('<title>x</title>');

		expect(await deployment.deployNewVersion()).toBe('111-deploy1');
		expect(await deployment.deployNewVersion('v2')).toBe('111-deploy1-v2');
		expect(deployment.version).toBe('111-deploy1-v2');
		const page = await (await fetch(deployment.url('/docs'))).text();
		expect(page).toBe('<html><head><meta name="test-version" content="v2"></head></html>');
		const worker = await (await fetch(deployment.url('/service-worker.js'))).text();
		expect(worker).toMatch(/^const v = "111-deploy1-v2"; const w = "111-deploy1-v2";\n/);
		expect(await (await fetch(deployment.url('/_app/version.json'))).json()).toEqual({
			version: '111-deploy1-v2'
		});
		// The original build is untouched.
		expect(await readFile(join(build, 'service-worker.js'), 'utf8')).toBe(
			'const v = "111"; const w = "111";'
		);
		await deployment.close();
		await expect(readFile(join(deployment.dir, 'index.html'))).rejects.toThrow();
	});

	it('refuses a directory that is not a SvelteKit build', async () => {
		await expect(serveDeployment(join(build, 'docs'))).rejects.toThrow(/version\.json/);
	});
});
