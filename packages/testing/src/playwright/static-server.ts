import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve as resolvePath, sep } from 'node:path';

const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.wasm': 'application/wasm',
	'.xml': 'application/xml',
	'.map': 'application/json',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.ico': 'image/x-icon',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
	'.woff2': 'font/woff2'
};

async function resolveFile(dir: string, pathname: string): Promise<string | null> {
	let base: string;
	try {
		base = resolvePath(dir, `.${decodeURIComponent(pathname)}`);
	} catch {
		return null; // Malformed % escape.
	}
	// Never serve files outside the build directory (e.g. via `..`).
	const root = resolvePath(dir);
	const inside = (path: string) => path.startsWith(root + sep);
	if (base !== root && !inside(base)) return null;
	for (const candidate of [base, `${base}.html`, join(base, 'index.html')].filter(inside)) {
		try {
			if ((await stat(candidate)).isFile()) return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

/** Throws unless `base` is a base path as SvelteKit takes it (`""` or `/repo`). */
export function checkBase(base: string): void {
	if (base !== '' && (!base.startsWith('/') || base.endsWith('/')))
		throw new Error(`The base path "${base}" must be "" or start with "/" and not end with "/".`);
}

export type StaticServer = {
	/** `http://127.0.0.1:<port>`. */
	origin: string;
	/** The full URL of an app path (`/hello` → `<origin><base>/hello`). */
	url(path: string): string;
	/** Every request's path and query as the server received them, oldest first. */
	readonly requests: readonly string[];
	close(): Promise<void>;
};

/**
 * Serves a build directory the way GitHub Pages does: `/page` finds `page.html`, and unknown
 * paths get `404.html` with a 404 status. Unlike `vite preview`, nothing is rendered on the fly.
 * With a `base` (a project site, `user.github.io/repo`), the build is served under it and
 * nothing else exists. Files are read on every request, so a test can change them (see
 * `serveDeployment`).
 */
export async function serveStatic(
	dir: string,
	{ base = '' }: { base?: string } = {}
): Promise<StaticServer> {
	checkBase(base);
	const requests: string[] = [];
	const server = createServer(async (req, res) => {
		requests.push(req.url ?? '/');
		try {
			const pathname = new URL(req.url ?? '/', 'http://x').pathname;
			if (base && pathname !== base && !pathname.startsWith(`${base}/`))
				return res.writeHead(404).end();
			const file = await resolveFile(dir, pathname.slice(base.length) || '/');
			const served = file ?? (await resolveFile(dir, '/404.html'));
			if (!served) return res.writeHead(404).end();
			const body = await readFile(served);
			res.writeHead(file ? 200 : 404, {
				'content-type': TYPES[extname(served)] ?? 'application/octet-stream',
				'cache-control': 'no-cache'
			});
			res.end(body);
		} catch {
			// Never let a bad request become an unhandled rejection in the test process.
			if (!res.headersSent) res.writeHead(500);
			res.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	const origin = `http://127.0.0.1:${port}`;
	return {
		origin,
		url: (path) => `${origin}${base}${path.startsWith('/') ? path : `/${path}`}`,
		requests,
		close: () =>
			new Promise((resolve) => {
				server.close(() => resolve());
				// Browsers keep connections alive; don't wait for them to go idle.
				server.closeAllConnections();
			})
	};
}
