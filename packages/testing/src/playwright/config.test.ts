import { afterEach, describe, expect, it, vi } from 'vitest';
import { xcwdsPlaywright } from './config.js';

afterEach(() => void vi.unstubAllEnvs());

describe('xcwdsPlaywright', () => {
	it('blocks service workers and uses CHROMIUM_PATH', () => {
		vi.stubEnv('CHROMIUM_PATH', '/opt/chrome');
		vi.stubEnv('CI', '');
		expect(xcwdsPlaywright()).toEqual({
			testDir: 'e2e',
			reporter: 'list',
			use: {
				channel: 'chromium',
				trace: 'retain-on-failure',
				serviceWorkers: 'block',
				launchOptions: { executablePath: '/opt/chrome', args: ['--disable-gpu'] }
			}
		});
	});

	it('merges yours over it', () => {
		vi.stubEnv('CHROMIUM_PATH', '');
		vi.stubEnv('CI', 'true');
		const config = xcwdsPlaywright({
			testDir: 'tests',
			webServer: { command: 'serve' },
			use: { serviceWorkers: 'allow', launchOptions: { args: ['--lang=fr', '--disable-gpu'] } }
		});
		expect(config).toMatchObject({
			testDir: 'tests',
			webServer: { command: 'serve' },
			use: {
				channel: 'chromium',
				serviceWorkers: 'allow',
				launchOptions: { executablePath: undefined, args: ['--disable-gpu', '--lang=fr'] }
			}
		});
		expect(config.reporter).toEqual([['github'], ['html', { open: 'never' }]]);
	});
});
