/** What the plugin saves: the count, and when counting started. */
export type Tally = { count: number; since: string };

/** Returns `raw` if it is a valid tally, otherwise `undefined` (saved data can be anything). */
export function parseTally(raw: unknown): Tally | undefined {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const { count, since } = raw as Record<string, unknown>;
	if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
	if (typeof since !== 'string' || Number.isNaN(Date.parse(since))) return undefined;
	return { count, since };
}

/** `tally` plus `step`, starting a new tally (from `now`) when there is none. */
export function add(tally: Tally | undefined, step: number, now = new Date()): Tally {
	return { count: (tally?.count ?? 0) + step, since: tally?.since ?? now.toISOString() };
}
