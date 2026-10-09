import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ICONS } from '../config.js';
import { icoFromPng, renderIcons } from './icons.js';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123456"/></svg>`;

/** Width, height and RGBA of a PNG, decoded by rendering it as an image. */
function decode(png: Buffer) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);
	const sized = svg
		.replace('<svg ', `<svg width="${width}" height="${height}" `)
		.replace('<image ', `<image width="${width}" height="${height}" `);
	return { width, height, pixels: new Resvg(sized).render().pixels };
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'xcwds-icons-'));
	await writeFile(join(dir, 'icon.svg'), SVG);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('renderIcons', () => {
	it('writes every icon at its size, rounding the regular ones only', async () => {
		const out = join(dir, 'static');
		const { files, cached } = await renderIcons({ source: join(dir, 'icon.svg'), outDir: out });
		expect(cached).toBe(false);
		expect(files.sort()).toEqual(Object.values(ICONS).sort());
		expect(await readFile(join(out, ICONS.svg), 'utf8')).toBe(SVG);

		const regular = decode(await readFile(join(out, ICONS.png192)));
		expect([regular.width, regular.height]).toEqual([192, 192]);
		expect(regular.pixels[3]).toBe(0); // the corner is transparent
		const centre = (96 * 192 + 96) * 4;
		expect([...regular.pixels.subarray(centre, centre + 4)]).toEqual([0x12, 0x34, 0x56, 255]);

		const maskable = decode(await readFile(join(out, ICONS.maskable)));
		expect(maskable.width).toBe(512);
		expect(maskable.pixels[3]).toBe(255); // full-bleed
		expect(decode(await readFile(join(out, ICONS.apple))).width).toBe(180);

		const ico = await readFile(join(out, ICONS.favicon));
		expect([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6]]).toEqual([1, 1, 32]);
		expect(ico.subarray(22, 26).toString('latin1')).toBe('\x89PNG');
	});

	it('skips rendering when the source hasn’t changed', async () => {
		const render = vi.fn(() => new Uint8Array([1]));
		const opts = { source: join(dir, 'icon.svg'), outDir: join(dir, 'out'), render };
		await renderIcons(opts);
		const calls = render.mock.calls.length;
		expect((await renderIcons(opts)).cached).toBe(true);
		expect(render).toHaveBeenCalledTimes(calls);
		await writeFile(join(dir, 'icon.svg'), SVG.replace('#123456', '#654321'));
		expect((await renderIcons(opts)).cached).toBe(false);
		await rm(join(dir, 'out', ICONS.png512));
		expect((await renderIcons(opts)).cached).toBe(false);
		expect((await stat(join(dir, 'out', ICONS.png512))).isFile()).toBe(true);
	});
});

describe('icoFromPng', () => {
	it('uses 0 for 256 px and up, as the format requires', () => {
		const ico = icoFromPng(new Uint8Array(4), 256);
		expect([ico[6], ico[7], ico.length]).toEqual([0, 0, 26]);
	});
});
