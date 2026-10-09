import { defineConfig } from '@playwright/test';
import { xcwdsPlaywright } from '@xcwds/testing/playwright';

// Service workers are blocked unless a test opts in with `test.use({ serviceWorkers: 'allow' })`;
// CHROMIUM_PATH points at a Chromium you already have.
export default defineConfig(xcwdsPlaywright());
