/**
 * Just enough semver to check a plugin's `core` range at boot, without a dependency in every
 * app's bundle. Supports exact versions, `*`, `x` wildcards (`1.x`, `1`), `^`, `~`, the
 * comparators `>`, `>=`, `<`, `<=`, `=`, space-separated AND and `||`. Prerelease tags are
 * compared as lower than the release, as in semver.
 */

type Version = [number, number, number, string];

function parse(version: string): Version | undefined {
	const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
		version.trim()
	);
	if (!m) return undefined;
	return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''];
}

function compare(a: Version, b: Version): number {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
	if (a[3] === b[3]) return 0;
	if (a[3] === '') return 1;
	if (b[3] === '') return -1;
	return a[3] < b[3] ? -1 : 1;
}

type Comparator = { op: '<' | '<=' | '>' | '>=' | '='; version: Version };

/** A partial version (`1`, `1.2`, `1.x`) as [major, minor, patch] with undefined wildcards. */
function partial(text: string): (number | undefined)[] | undefined {
	const parts = text.replace(/^v/, '').split('-')[0]!.split('.');
	if (parts.length > 3) return undefined;
	const out: (number | undefined)[] = [];
	for (const p of parts) {
		if (p === 'x' || p === 'X' || p === '*') out.push(undefined);
		else if (/^\d+$/.test(p)) out.push(Number(p));
		else return undefined;
	}
	while (out.length < 3) out.push(undefined);
	return out;
}

const v = (major: number, minor = 0, patch = 0, pre = ''): Version => [major, minor, patch, pre];

function expand(token: string): Comparator[] | undefined {
	if (token === '*' || token === '' || token === 'x' || token === 'X') return [];
	const op = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(token)!;
	const operator = op[1] ?? '';
	const rest = op[2]!;
	const exact = parse(rest);
	const p = partial(rest);
	if (!exact && !p) return undefined;
	const [major, minor, patch] = p ?? [];
	const wild = !exact;
	if (operator === '' || operator === '=') {
		if (exact) return [{ op: '=', version: exact }];
		if (major === undefined) return [];
		if (minor === undefined)
			return [
				{ op: '>=', version: v(major) },
				{ op: '<', version: v(major + 1, 0, 0, '0') }
			];
		return [
			{ op: '>=', version: v(major, minor) },
			{ op: '<', version: v(major, minor + 1, 0, '0') }
		];
	}
	const base = exact ?? v(major ?? 0, minor ?? 0, patch ?? 0);
	if (operator === '^') {
		if (major === undefined) return [];
		let upper: Version;
		if (major > 0 || minor === undefined) upper = v(major + 1, 0, 0, '0');
		else if (minor > 0 || patch === undefined) upper = v(0, minor + 1, 0, '0');
		else upper = v(0, 0, (patch ?? 0) + 1, '0');
		return [
			{ op: '>=', version: base },
			{ op: '<', version: upper }
		];
	}
	if (operator === '~') {
		if (major === undefined) return [];
		const upper = minor === undefined ? v(major + 1, 0, 0, '0') : v(major, minor + 1, 0, '0');
		return [
			{ op: '>=', version: base },
			{ op: '<', version: upper }
		];
	}
	if (wild && (operator === '>' || operator === '<=') && major !== undefined) {
		// `>1.x` means `>=2.0.0`; `<=1.x` means `<2.0.0`.
		const next = minor === undefined ? v(major + 1) : v(major, minor + 1);
		return [{ op: operator === '>' ? '>=' : '<', version: next }];
	}
	return [{ op: operator as Comparator['op'], version: base }];
}

function test(version: Version, c: Comparator): boolean {
	const d = compare(version, c.version);
	switch (c.op) {
		case '<':
			return d < 0;
		case '<=':
			return d <= 0;
		case '>':
			return d > 0;
		case '>=':
			return d >= 0;
		case '=':
			return d === 0;
	}
}

/** Whether `version` satisfies `range`. An unparseable version or range never matches. */
export function satisfies(version: string, range: string): boolean {
	const ver = parse(version);
	if (!ver) return false;
	return range.split('||').some((set) => {
		const comparators: Comparator[] = [];
		const tokens = set
			.trim()
			.replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1')
			.split(/\s+/)
			.filter(Boolean);
		for (const token of tokens) {
			const expanded = expand(token);
			if (!expanded) return false;
			comparators.push(...expanded);
		}
		// Like semver, a prerelease only matches a range that names a prerelease of the same version.
		const sameRelease = (c: Comparator) =>
			c.version[3] !== '' && c.version.slice(0, 3).join() === ver.slice(0, 3).join();
		if (ver[3] !== '' && !comparators.some(sameRelease)) return false;
		return comparators.every((c) => test(ver, c));
	});
}
