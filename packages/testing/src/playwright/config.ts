import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * A Playwright config for @xcwds apps (from what kept xcwds.github.io's CI stable):
 * - full Chromium in its new headless mode, with no GPU process (#75 there);
 * - service workers blocked unless a test opts in with `test.use({ serviceWorkers: 'allow' })`
 *   (#91 there: workers installing while contexts closed crashed Chromium on CI);
 * - `CHROMIUM_PATH` points at a Chromium you already have (containers without
 *   `playwright install`);
 * - GitHub annotations and an HTML report on CI, traces kept for failures.
 *
 * Your `config` is merged over it (`use` and `use.launchOptions` key by key).
 */
export function xcwdsPlaywright(config: PlaywrightTestConfig = {}): PlaywrightTestConfig {
	const { use = {}, ...rest } = config;
	const { launchOptions = {}, ...useRest } = use;
	return {
		testDir: 'e2e',
		reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
		...rest,
		use: {
			channel: 'chromium',
			trace: 'retain-on-failure',
			serviceWorkers: 'block',
			...useRest,
			launchOptions: {
				executablePath: process.env.CHROMIUM_PATH || undefined,
				...launchOptions,
				args: [...new Set(['--disable-gpu', ...(launchOptions.args ?? [])])]
			}
		}
	};
}
