/**
 * `xcwds.config.ts`: how a user makes their own PWA (#7). Plugins appear in it as descriptors
 * (package name + JSON options), which the integration turns into imports for the build, the
 * page and the service worker (RFC 0001, decision 1).
 */
import { XcwdsError, codes } from './errors.js';
import { isRecord, notJson } from './json.js';
import { isOrigin } from './privacy.js';

export type Descriptor<Options = Record<string, unknown>> = {
	/** The plugin's package name; its `./client` and `./worker` exports are imported. */
	readonly name: string;
	readonly options: Options;
};

/**
 * Makes a plugin's config factory: `export default descriptor<TimerOptions>('@xcwds/plugin-timers')`
 * lets users write `timers({ prefix: '/utils/timer' })` in their config.
 */
export function descriptor<Options extends object = Record<string, unknown>>(name: string) {
	return (options?: Options): Descriptor<Options> => ({
		name,
		options: (options ?? {}) as Options
	});
}

export type ThemeColor = { light: string; dark?: string };

export type BrandConfig = {
	/** App name: the title, the manifest name, the home-screen label. */
	name: string;
	/** Home-screen label when `name` is too long. Defaults to `name`. */
	shortName?: string;
	tagline?: string;
	/** Manifest description. Defaults to the tagline. */
	description?: string;
	/** Path to a square SVG, rendered into PNG, maskable, Apple touch and favicon icons. */
	icon?: string;
	/** Browser bar colour, per colour scheme. */
	themeColor?: string | ThemeColor;
	/** Splash screen colour. Defaults to the light theme colour. */
	backgroundColor?: string;
	lang?: string;
};

export type XcwdsConfig = {
	brand: BrandConfig;
	/** Extra Web App Manifest fields, merged over the generated ones. */
	manifest?: Record<string, unknown>;
	storage?: { prefix?: string };
	/**
	 * Origins the app may contact besides those its plugins declare (#22): `https:` or `wss:`.
	 * Empty: none. The build fails on any other origin it finds, and the CSP blocks the rest.
	 */
	privacy?: { allowOrigins?: string[] };
	plugins?: Descriptor<object>[];
};

export type ResolvedConfig = {
	brand: Required<Omit<BrandConfig, 'icon' | 'themeColor'>> & {
		icon: string | undefined;
		themeColor: Required<ThemeColor>;
	};
	manifest: Record<string, unknown>;
	storage: { prefix: string };
	privacy: { allowOrigins: string[] };
	plugins: Descriptor<Record<string, unknown>>[];
};

/** Types a config file. */
export function defineConfig(config: XcwdsConfig): XcwdsConfig {
	return config;
}

export type ConfigIssue = { path: string; message: string };

export type ValidateOptions = {
	/** Checks that a path in the config exists (the integration passes a filesystem check). */
	fileExists?: (path: string) => boolean;
};

const DEFAULT_THEME: Required<ThemeColor> = { light: '#ffffff', dark: '#111111' };
const COLOR =
	/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]+|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^()]*\))$/i;

/** Checks a config and fills in defaults. Errors carry the key path, e.g. `brand.icon`. */
export function validateConfig(
	input: unknown,
	options: ValidateOptions = {}
): { ok: true; config: ResolvedConfig } | { ok: false; issues: ConfigIssue[] } {
	const issues: ConfigIssue[] = [];
	const issue = (path: string, message: string) => issues.push({ path, message });
	const string = (v: unknown, path: string, { required = false } = {}) => {
		if (v === undefined && !required) return undefined;
		if (typeof v !== 'string' || v.trim() === '') {
			issue(
				path,
				required ? 'is required and must be a non-empty string' : 'must be a non-empty string'
			);
			return undefined;
		}
		return v;
	};
	const color = (v: unknown, path: string) => {
		const s = string(v, path);
		if (s !== undefined && !COLOR.test(s.trim())) issue(path, `"${s}" isn't a CSS colour`);
		return s;
	};

	if (!isRecord(input)) return { ok: false, issues: [{ path: '', message: 'must be an object' }] };
	const known = new Set(['brand', 'manifest', 'storage', 'privacy', 'plugins']);
	for (const key of Object.keys(input)) if (!known.has(key)) issue(key, 'is not a config option');

	const brand = isRecord(input.brand) ? input.brand : (issue('brand', 'is required'), {});
	const name = string(brand.name, 'brand.name', { required: true }) ?? '';
	const shortName = string(brand.shortName, 'brand.shortName') ?? name;
	const tagline = string(brand.tagline, 'brand.tagline') ?? '';
	const description = string(brand.description, 'brand.description') ?? tagline;
	const icon = string(brand.icon, 'brand.icon');
	if (icon !== undefined) {
		if (!/\.svg$/i.test(icon)) issue('brand.icon', 'must be an SVG file');
		else if (options.fileExists && !options.fileExists(icon))
			issue('brand.icon', `file not found: ${icon}`);
	}
	let themeColor = { ...DEFAULT_THEME };
	if (typeof brand.themeColor === 'string') {
		const c = color(brand.themeColor, 'brand.themeColor');
		if (c) themeColor = { light: c, dark: c };
	} else if (isRecord(brand.themeColor)) {
		const light = color(brand.themeColor.light, 'brand.themeColor.light');
		if (brand.themeColor.light === undefined) issue('brand.themeColor.light', 'is required');
		const dark = color(brand.themeColor.dark, 'brand.themeColor.dark');
		themeColor = { light: light ?? DEFAULT_THEME.light, dark: dark ?? light ?? DEFAULT_THEME.dark };
	} else if (brand.themeColor !== undefined)
		issue('brand.themeColor', 'must be a colour or { light, dark }');
	const backgroundColor = color(brand.backgroundColor, 'brand.backgroundColor') ?? themeColor.light;
	const lang = string(brand.lang, 'brand.lang') ?? 'en';
	if (isRecord(input.brand)) {
		const fields = [
			'name',
			'shortName',
			'tagline',
			'description',
			'icon',
			'themeColor',
			'backgroundColor',
			'lang'
		];
		for (const key of Object.keys(input.brand))
			if (!fields.includes(key)) issue(`brand.${key}`, 'is not a brand option');
	}

	let manifest: Record<string, unknown> = {};
	if (input.manifest !== undefined) {
		if (!isRecord(input.manifest)) issue('manifest', 'must be an object');
		else {
			const bad = notJson(input.manifest, 'manifest');
			if (bad) issue(bad, 'must be JSON');
			manifest = input.manifest;
		}
	}

	let prefix = 'app:';
	if (input.storage !== undefined) {
		if (!isRecord(input.storage)) issue('storage', 'must be an object');
		else if (input.storage.prefix !== undefined) {
			if (
				typeof input.storage.prefix !== 'string' ||
				!/^[a-z0-9][a-z0-9-]*:$/i.test(input.storage.prefix)
			)
				issue('storage.prefix', 'must be letters, digits or dashes ending in ":" (e.g. "app:")');
			else prefix = input.storage.prefix;
		}
	}

	const allowOrigins: string[] = [];
	if (input.privacy !== undefined) {
		if (!isRecord(input.privacy)) issue('privacy', 'must be an object');
		else if (input.privacy.allowOrigins !== undefined) {
			if (!Array.isArray(input.privacy.allowOrigins))
				issue('privacy.allowOrigins', 'must be an array');
			else
				input.privacy.allowOrigins.forEach((o, i) => {
					const path = `privacy.allowOrigins[${i}]`;
					if (!isOrigin(o))
						issue(path, 'must be an https or wss origin like "https://example.com"');
					else if (!allowOrigins.includes(o)) allowOrigins.push(o);
				});
		}
	}

	const plugins: Descriptor<Record<string, unknown>>[] = [];
	if (input.plugins !== undefined) {
		if (!Array.isArray(input.plugins)) issue('plugins', 'must be an array');
		else {
			const seen = new Set<string>();
			input.plugins.forEach((p, i) => {
				const path = `plugins[${i}]`;
				if (typeof p === 'function') {
					issue(path, 'is a plugin factory; call it, e.g. `timers()`');
					return;
				}
				if (!isRecord(p) || typeof p.name !== 'string' || p.name === '') {
					issue(path, 'must be a plugin descriptor ({ name, options })');
					return;
				}
				if (seen.has(p.name)) issue(path, `"${p.name}" is listed twice`);
				seen.add(p.name);
				const opts = p.options ?? {};
				if (!isRecord(opts)) {
					issue(`${path}.options`, 'must be an object');
					return;
				}
				const bad = notJson(opts, `${path}.options`);
				if (bad)
					issue(
						bad,
						`can't be passed to "${p.name}": options must be JSON (no functions, classes or undefined)`
					);
				else plugins.push({ name: p.name, options: opts });
			});
		}
	}

	if (issues.length) return { ok: false, issues };
	return {
		ok: true,
		config: {
			brand: { name, shortName, tagline, description, icon, themeColor, backgroundColor, lang },
			manifest,
			storage: { prefix },
			privacy: { allowOrigins },
			plugins
		}
	};
}

/** Like `validateConfig`, but throws one error listing every issue. */
export function resolveConfig(input: unknown, options: ValidateOptions = {}): ResolvedConfig {
	const result = validateConfig(input, options);
	if (result.ok) return result.config;
	const lines = result.issues.map((i) => `  ${i.path || '(config)'}: ${i.message}`);
	throw new XcwdsError(codes.CONFIG_INVALID, `Invalid xcwds config:\n${lines.join('\n')}`);
}

/** Checks a SvelteKit-style base path: `''` or `/something` with no trailing slash. */
function checkBase(base: string): string {
	if (base !== '' && (!base.startsWith('/') || base.endsWith('/')))
		throw new XcwdsError(
			codes.CONFIG_INVALID,
			`The base path "${base}" must be "" or start with "/" and not end with "/".`
		);
	return base;
}

/** The icon files the build renders from `brand.icon` (see `@xcwds/core/build`). */
export const ICONS = {
	svg: 'icons/icon.svg',
	png192: 'icons/icon-192.png',
	png512: 'icons/icon-512.png',
	maskable: 'icons/maskable-512.png',
	apple: 'icons/apple-touch-icon.png',
	favicon: 'favicon.ico'
} as const;

/**
 * The Web App Manifest for a config. Everything is under `base` (SvelteKit's `paths.base`), so
 * apps work on `user.github.io/repo` as well as on their own domain. `onManifest` hooks run on
 * the result, then `config.manifest` is merged over it by the integration.
 */
export function createManifest(
	config: ResolvedConfig,
	{ base = '' } = {}
): Record<string, unknown> {
	const root = `${checkBase(base)}/`;
	const { brand } = config;
	const manifest: Record<string, unknown> = {
		name: brand.name,
		short_name: brand.shortName,
		...(brand.description ? { description: brand.description } : {}),
		lang: brand.lang,
		id: root,
		start_url: root,
		scope: root,
		display: 'standalone',
		background_color: brand.backgroundColor,
		theme_color: brand.themeColor.light
	};
	if (brand.icon) {
		manifest.icons = [
			{ src: `${root}${ICONS.svg}`, sizes: 'any', type: 'image/svg+xml' },
			{ src: `${root}${ICONS.png192}`, sizes: '192x192', type: 'image/png' },
			{ src: `${root}${ICONS.png512}`, sizes: '512x512', type: 'image/png' },
			{ src: `${root}${ICONS.maskable}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		];
	}
	return { ...manifest, ...config.manifest };
}

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `<head>` tags for the manifest, icons, theme colour and iOS home-screen support. */
export function headTags(config: ResolvedConfig, { base = '' } = {}): string {
	const root = `${checkBase(base)}/`;
	const { brand } = config;
	const tags = [
		`<link rel="manifest" href="${escape(root)}manifest.webmanifest" />`,
		`<meta name="theme-color" content="${escape(brand.themeColor.light)}" />`,
		'<meta name="mobile-web-app-capable" content="yes" />',
		`<meta name="apple-mobile-web-app-title" content="${escape(brand.shortName)}" />`
	];
	if (brand.description)
		tags.push(`<meta name="description" content="${escape(brand.description)}" />`);
	if (brand.icon) {
		tags.push(
			`<link rel="icon" href="${escape(root + ICONS.svg)}" type="image/svg+xml" />`,
			`<link rel="icon" href="${escape(root + ICONS.favicon)}" sizes="32x32" />`,
			`<link rel="apple-touch-icon" href="${escape(root + ICONS.apple)}" />`
		);
	}
	return tags.join('\n');
}
