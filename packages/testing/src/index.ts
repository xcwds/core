/** `@xcwds/testing`: unit-test an @xcwds app and its plugins with Vitest. */
export {
	buildTestApp,
	type NavigationResult,
	type TestApp,
	type TestAppOptions,
	type TestHelpers
} from './app.js';
export { DEFAULT_NOW, fakeClock, type FakeClock } from './clock.js';
export type { Importer, TestInput, TestPlugin } from './plugins.js';
export { FakeStorageEvent, sharedStorage, type SharedStorage } from './tabs.js';
export {
	MemoryCache,
	MemoryCacheStorage,
	buildTestWorker,
	type TestWorker,
	type TestWorkerOptions
} from './worker.js';
export { memoryStorage } from '@xcwds/core';
