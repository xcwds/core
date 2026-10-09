import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { emittedFiles } from './codegen.js';
import { OUT_DIR } from './generate.js';
import type { BuildState } from './state.js';

/**
 * The files the build adds beside SvelteKit's output: `manifest.webmanifest` and, with
 * `brand.icon`, the icons rendered by `@xcwds/core/build` (cached in `.xcwds/assets`).
 */
export async function buildAssets(state: BuildState): Promise<Map<string, string | Uint8Array>> {
	const files = new Map<string, string | Uint8Array>();
	files.set('manifest.webmanifest', `${JSON.stringify(state.manifest, null, '\t')}\n`);
	const { icon } = state.config.brand;
	if (icon) {
		const { renderIcons } = await import('@xcwds/core/build');
		const outDir = join(state.root, OUT_DIR, 'assets');
		await renderIcons({ source: resolve(state.root, icon), outDir });
		for (const file of emittedFiles(state))
			if (!files.has(file)) files.set(file, await readFile(join(outDir, file)));
	}
	return files;
}

const TYPES: Record<string, string> = {
	webmanifest: 'application/manifest+json',
	png: 'image/png',
	svg: 'image/svg+xml',
	ico: 'image/x-icon'
};

export function contentType(file: string): string {
	return TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream';
}
