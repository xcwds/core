import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		// Full Chromium in new headless mode with no GPU process: the setup that kept CI stable in
		// xcwds.github.io (#75 and #91 there).
		channel: 'chromium',
		launchOptions: {
			args: ['--disable-gpu'],
			// Containers that ship their own Chromium (no `playwright install`) point at it here.
			executablePath: process.env.CHROMIUM_PATH || undefined
		},
		trace: 'retain-on-failure',
		// No service worker unless a test file opts in with `test.use({ serviceWorkers: 'allow' })`.
		serviceWorkers: 'block'
	}
});
