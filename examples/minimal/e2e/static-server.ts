import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve as resolvePath, sep } from 'node:path';

const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
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
	if (base !== root && !base.startsWith(root + sep)) return null;
	for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
		try {
			if ((await stat(candidate)).isFile()) return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

/**
 * Serves a build directory the way GitHub Pages does: `/page` finds `page.html`, and unknown
 * paths get `404.html` with a 404 status. Unlike `vite preview`, nothing is rendered on the fly.
 * Resolves to the server's origin and a function that stops it.
 */
export async function serveStatic(
	dir: string
): Promise<{ origin: string; close: () => Promise<void> }> {
	const server = createServer(async (req, res) => {
		try {
			const file = await resolveFile(dir, new URL(req.url ?? '/', 'http://x').pathname);
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
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
