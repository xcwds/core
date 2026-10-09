/** `@xcwds/testing/playwright`: end-to-end helpers for @xcwds apps. */
export { xcwdsPlaywright } from './config.js';
export { pageVersion, serveDeployment, type Deployment } from './deploy.js';
export {
	auditTapTargets,
	gotoHydrated,
	updateServiceWorker,
	waitForServiceWorker
} from './page.js';
export { serveStatic, type StaticServer } from './static-server.js';
