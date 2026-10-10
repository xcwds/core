/**
 * Markdown to HTML for the site: headings get GitHub's ids (so links written for GitHub work
 * here too), the title is left to the shell's header, and relative links go to the site page
 * for that file or, failing that, to the file on GitHub.
 */
import { Marked, type Tokens } from 'marked';
import { posix } from 'node:path';
import { exists, pageForFile, REPOSITORY } from './pages.js';

export type Heading = { id: string; text: string; depth: number };

export type Rendered = { html: string; headings: Heading[] };

/** GitHub's heading ids: lowercase, punctuation dropped, spaces to dashes, numbered repeats. */
export function slugger() {
	const seen = new Map<string, number>();
	return (text: string) => {
		const base = text
			.toLowerCase()
			.trim()
			.replace(/[^\p{L}\p{N}\s_-]/gu, '')
			.replace(/\s/g, '-');
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count ? `${base}-${count}` : base;
	};
}

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text of inline Markdown, for ids and the table of contents. */
const plain = (s: string) =>
	s
		.replace(/`([^`]*)`/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_]/g, '');

/**
 * Where a link in `file` (a repository path) should go on the site. `base` is the site's base
 * path.
 */
export function linkTarget(href: string, file: string, base: string): string {
	if (/^([a-z]+:|\/\/|#)/i.test(href) || href.startsWith('/')) return href;
	const [path = '', hash] = href.split('#');
	const repoPath = posix.normalize(posix.join(posix.dirname(file), path));
	const anchor = hash ? `#${hash}` : '';
	const page = pageForFile(repoPath);
	if (page) return `${base}${page.path}${anchor}`;
	if (repoPath.startsWith('..') || !exists(repoPath))
		throw new Error(`${file} links to ${href}, which doesn't exist.`);
	return `${REPOSITORY}/blob/main/${repoPath}${anchor}`;
}

export function render(markdown: string, file: string, base: string): Rendered {
	const headings: Heading[] = [];
	const slug = slugger();
	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth, text }: Tokens.Heading) {
				// The shell's header shows the title.
				if (depth === 1) return '';
				const id = slug(plain(text));
				headings.push({ id, text: plain(text), depth });
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${this.parser.parseInline(tokens)}</a></h${depth}>\n`;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const target = linkTarget(href, file, base);
				const external = /^https?:/.test(target);
				const attrs = `${title ? ` title="${escape(title)}"` : ''}${external ? ' rel="noreferrer"' : ''}`;
				return `<a href="${escape(target)}"${attrs}>${this.parser.parseInline(tokens)}</a>`;
			},
			html({ text }: Tokens.HTML | Tokens.Tag) {
				// Comments (prettier-ignore, file markers) are for the repository, not the page.
				return /^\s*<!--[\s\S]*-->\s*$/.test(text) ? '' : text;
			}
		}
	});
	const html = marked.parse(markdown, { async: false });
	return { html, headings };
}

/** Inline Markdown (doc comments in the reference), with links relative to `file`. */
export function renderInline(markdown: string, file: string, base: string): string {
	return new Marked({
		renderer: {
			link({ href, tokens }: Tokens.Link) {
				return `<a href="${escape(linkTarget(href, file, base))}">${this.parser.parseInline(tokens)}</a>`;
			}
		}
	}).parseInline(markdown, { async: false });
}
