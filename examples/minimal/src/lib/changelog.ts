import type { ChangelogEntry } from '@xcwds/plugin-changelog';

/** What's new, newest first: each change people will notice adds one entry with the next id. */
export const changelog: ChangelogEntry[] = [
	{
		id: 2,
		date: '2026-10-09',
		items: ['Settings has a What’s new section.', 'Timers keep ringing on every page.']
	},
	{ id: 1, date: '2026-10-08', items: ['The first version.'] }
];
