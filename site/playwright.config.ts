import { defineConfig } from '@playwright/test';
import { xcwdsPlaywright } from '@xcwds/testing/playwright';

// Service workers are blocked unless a test opts in with `test.use({ serviceWorkers: 'allow' })`;
// set CHROMIUM_PATH to use a Chromium you already have.
export default defineConfig(xcwdsPlaywright());
