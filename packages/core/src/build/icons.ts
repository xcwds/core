/**
 * Renders the app's icons from one SVG, in Node with resvg (no browser needed). Regular icons
 * get rounded corners; maskable and Apple touch icons are full-bleed, since the OS crops them.
 * Output is cached by the SVG's hash, so unchanged icons aren't rendered again.
 *
 * Needs the optional peer dependency `@resvg/resvg-js`.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ICONS } from '../config.js';

type Png = { file: string; size: number; radius: number };

const PNGS: Png[] = [
	{ file: ICONS.png192, size: 192, radius: 0.22 },
	{ file: ICONS.png512, size: 512, radius: 0.22 },
	{ file: ICONS.maskable, size: 512, radius: 0 },
	{ file: ICONS.apple, size: 180, radius: 0 }
];
const FAVICON_SIZE = 32;
const STAMP = 'icons/.xcwds-icons';

type Renderer = (svg: string) => Uint8Array;

async function loadRenderer(): Promise<Renderer> {
	let mod: typeof import('@resvg/resvg-js');
	try {
		mod = await import('@resvg/resvg-js');
	} catch {
		throw new Error('Rendering icons needs @resvg/resvg-js: add it to your devDependencies.');
	}
	return (svg) => new mod.Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}

/** The source drawn at `size`, clipped to a rounded square when `radius` (a fraction) > 0. */
function frame(source: Buffer, size: number, radius: number): string {
	const href = `data:image/svg+xml;base64,${source.toString('base64')}`;
	const r = radius * size;
	const clip =
		r > 0 ? `<clipPath id="c"><rect width="${size}" height="${size}" rx="${r}"/></clipPath>` : '';
	const attr = r > 0 ? ' clip-path="url(#c)"' : '';
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${clip}<image href="${href}" width="${size}" height="${size}"${attr}/></svg>`;
}

/** A .ico holding one PNG image (supported by every browser that reads favicons). */
export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
	const header = new Uint8Array(6 + 16);
	const view = new DataView(header.buffer);
	view.setUint16(2, 1, true); // type: icon
	view.setUint16(4, 1, true); // one image
	header[6] = size >= 256 ? 0 : size;
	header[7] = size >= 256 ? 0 : size;
	view.setUint16(10, 1, true); // colour planes
	view.setUint16(12, 32, true); // bits per pixel
	view.setUint32(14, png.length, true);
	view.setUint32(18, header.length, true);
	const out = new Uint8Array(header.length + png.length);
	out.set(header);
	out.set(png, header.length);
	return out;
}

export type RenderIconsOptions = {
	/** Path to the source SVG (`brand.icon`). */
	source: string;
	/** Directory the icons are written under (the app's static or build directory). */
	outDir: string;
	/** Replaces resvg (tests). */
	render?: Renderer;
};

/** Writes every icon the manifest and head tags refer to. Returns the files written. */
export async function renderIcons({ source, outDir, render }: RenderIconsOptions): Promise<{
	files: string[];
	cached: boolean;
}> {
	const svg = await readFile(source);
	const hash = createHash('sha256').update(svg).digest('hex');
	const files = [ICONS.svg, ...PNGS.map((p) => p.file), ICONS.favicon];
	const stamp = join(outDir, STAMP);
	if (
		existsSync(stamp) &&
		(await readFile(stamp, 'utf8')) === hash &&
		files.every((f) => existsSync(join(outDir, f)))
	)
		return { files, cached: true };

	const draw = render ?? (await loadRenderer());
	const write = async (file: string, data: Uint8Array | Buffer) => {
		await mkdir(dirname(join(outDir, file)), { recursive: true });
		await writeFile(join(outDir, file), data);
	};
	await write(ICONS.svg, svg);
	for (const p of PNGS) await write(p.file, draw(frame(svg, p.size, p.radius)));
	await write(ICONS.favicon, icoFromPng(draw(frame(svg, FAVICON_SIZE, 0.22)), FAVICON_SIZE));
	await write(STAMP, Buffer.from(hash));
	return { files, cached: false };
}
