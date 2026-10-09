const isPlainObject = (value: object) => {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * The path of the first value inside `value` that JSON can't carry unchanged (a function, a
 * class instance, `undefined`, `NaN`, a symbol...), or `null` when all of it can. Plugin
 * options cross from the build into the page and the worker as JSON (RFC 0001, decision 1).
 */
export function notJson(value: unknown, path = 'value', seen = new Set<object>()): string | null {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
	if (typeof value === 'number') return Number.isFinite(value) ? null : path;
	if (typeof value !== 'object') return path;
	if (seen.has(value)) return path;
	seen.add(value);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (!(i in value)) return `${path}[${i}]`;
			const bad = notJson(value[i], `${path}[${i}]`, seen);
			if (bad) return bad;
		}
	} else {
		if (!isPlainObject(value)) return path;
		for (const [key, v] of Object.entries(value)) {
			const bad = notJson(v, `${path}.${key}`, seen);
			if (bad) return bad;
		}
	}
	seen.delete(value);
	return null;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
