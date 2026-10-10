/** Writing an app to disk, and the small text edits `xcwds add` makes to existing files. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Writes `files` under `dir`, which must be empty or missing. */
export function writeApp(dir: string, files: Map<string, string>): void {
	if (existsSync(dir) && readdirSync(dir).some((f) => f !== '.git'))
		throw new Error(`${dir} isn't empty. Pick a new directory.`);
	for (const [path, content] of files) writeFile(join(dir, path), content);
}

export function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

export function readText(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** The index just past the bracket that closes the one at `open`, skipping strings and comments. */
function closing(source: string, open: number): number {
	const pairs: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
	const stack: string[] = [];
	for (let i = open; i < source.length; i++) {
		const c = source[i]!;
		if (c === '"' || c === "'" || c === '`') {
			for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
		} else if (c === '/' && source[i + 1] === '/') {
			while (i < source.length && source[i] !== '\n') i++;
		} else if (c === '/' && source[i + 1] === '*') {
			i = source.indexOf('*/', i + 2);
			if (i < 0) return -1;
			i++;
		} else if (pairs[c]) stack.push(pairs[c]);
		else if (c === ']' || c === '}' || c === ')') {
			if (stack.pop() !== c) return -1;
			if (!stack.length) return i;
		}
	}
	return -1;
}

/**
 * Adds `item` as the last element of the array literal that follows `marker` (e.g.
 * `plugins: [`), on its own line, indented like the array's other items; or, with `before`, just
 * before the first element line that matches it. Returns `null` when the array isn't found.
 */
export function appendToArray(
	source: string,
	marker: RegExp,
	item: string,
	before?: RegExp
): string | null {
	const match = marker.exec(source);
	if (!match) return null;
	const open = match.index + match[0].lastIndexOf('[');
	const close = closing(source, open);
	if (close < 0) return null;
	const lineStart = source.lastIndexOf('\n', open) + 1;
	const outer = /^[\t ]*/.exec(source.slice(lineStart))![0];
	const inner = `${outer}\t`;
	const body = source.slice(open + 1, close);
	const indented = inner + item.replace(/\n/g, `\n${inner}`);
	if (before) {
		let at = open + 1;
		for (const line of body.split('\n')) {
			if (before.test(line) && line.trim()) {
				const start = at + /^\s*/.exec(line)![0].length;
				const lineStart = source.lastIndexOf('\n', start) + 1;
				return `${source.slice(0, lineStart)}${indented},\n${source.slice(lineStart)}`;
			}
			at += line.length + 1;
		}
	}
	if (body.trim() === '')
		return `${source.slice(0, open + 1)}\n${indented}\n${outer}${source.slice(close)}`;
	// After the last element (and its comma, if the array keeps a trailing one).
	let end = close;
	while (/\s/.test(source[end - 1]!)) end--;
	const comma = source[end - 1] === ',' ? '' : ',';
	const trailing = comma ? '' : ',';
	return `${source.slice(0, end)}${comma}\n${indented}${trailing}${source.slice(end)}`;
}

/** Adds `line` after the last top-level `import` line (or at the top). */
export function addImport(source: string, line: string): string {
	if (source.includes(line)) return source;
	const lines = source.split('\n');
	let last = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^import\s/.test(lines[i]!)) {
			last = i;
			// A multi-line import ends at its `from '...'`.
			while (
				last < lines.length - 1 &&
				!/from\s+['"][^'"]+['"];?\s*$|^import\s+['"]/.test(lines[last]!)
			)
				last++;
			i = last;
		}
	}
	lines.splice(last + 1, 0, line);
	return lines.join('\n');
}
