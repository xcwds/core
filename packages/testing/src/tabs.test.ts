import { memoryStorage } from '@xcwds/core';
import { describe, expect, it } from 'vitest';
import { FakeStorageEvent, sharedStorage } from './tabs.js';

function listen(tab: EventTarget) {
	const seen: [string | null, string | null, string | null][] = [];
	tab.addEventListener('storage', (e) => {
		const { key, oldValue, newValue } = e as FakeStorageEvent;
		seen.push([key, oldValue, newValue]);
	});
	return seen;
}

describe('sharedStorage', () => {
	it('tells every other tab about a change, never the one that saved', async () => {
		const shared = sharedStorage();
		const [a, b, c] = [new EventTarget(), new EventTarget(), new EventTarget()];
		const [seenA, seenB, seenC] = [listen(a), listen(b), listen(c)];
		const storeA = shared.connect(a);
		const storeB = shared.connect(b);
		shared.connect(c);
		storeA.set('app:x', '1');
		expect(storeB.get('app:x')).toBe('1');
		expect(seenB).toEqual([]); // Delivered later, as in a browser.
		await shared.settled();
		expect(seenA).toEqual([]);
		expect(seenB).toEqual([['app:x', null, '1']]);
		expect(seenC).toEqual(seenB);

		storeB.set('app:x', '1'); // Unchanged: no event.
		storeB.remove('app:y'); // Nothing to remove: no event.
		storeB.remove('app:x');
		await shared.settled();
		expect(seenA).toEqual([['app:x', '1', null]]);
		expect(seenB).toEqual([['app:x', null, '1']]);
	});

	it('stops telling a tab once it disconnects, and reports clear() as key null', async () => {
		const backing = memoryStorage();
		const shared = sharedStorage(backing);
		const [a, b] = [new EventTarget(), new EventTarget()];
		const [seenA, seenB] = [listen(a), listen(b)];
		const storeA = shared.connect(a);
		const storeB = shared.connect(b);
		storeA.set('k', 'v');
		storeB.disconnect();
		await shared.settled();
		expect(seenB).toEqual([]);
		expect(backing.get('k')).toBe('v');
		shared.clear();
		await shared.settled();
		expect(backing.keys()).toEqual([]);
		expect(seenA).toEqual([[null, null, null]]);
	});

	it('settles events that other events cause', async () => {
		const shared = sharedStorage();
		const [a, b] = [new EventTarget(), new EventTarget()];
		const storeA = shared.connect(a);
		const storeB = shared.connect(b);
		b.addEventListener('storage', () => storeB.set('reply', 'pong'));
		const seenA = listen(a);
		storeA.set('ping', '1');
		await shared.settled();
		expect(seenA).toEqual([['reply', null, 'pong']]);
	});
});
