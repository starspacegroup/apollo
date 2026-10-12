import { describe, expect, it } from 'vitest';
import { readRelayTicket, signRelayTicket } from './relayTicket';

describe('the relay ticket', () => {
	const t = { project: 'Apollo', id: 'discord:1', name: 'David', provenance: 'david' as const, exp: 2_000_000_000 };
	it('reads back what it signed', async () => {
		const s = await signRelayTicket(t, 'secret');
		expect(await readRelayTicket(s, 'secret', 1_900_000_000)).toEqual(t);
	});
	it('refuses another secret, a lapsed ticket and a changed claim', async () => {
		const s = await signRelayTicket(t, 'secret');
		expect(await readRelayTicket(s, 'other', 1_900_000_000)).toBeNull();
		expect(await readRelayTicket(s, 'secret', 2_100_000_000)).toBeNull();
		const [payload, mac] = s.split('.');
		const forged = btoa(JSON.stringify({ ...t, provenance: 'david', project: 'Fleet' })).replace(/=+$/, '');
		expect(await readRelayTicket(`${forged}.${mac}`, 'secret', 1_900_000_000)).toBeNull();
		expect(payload.length).toBeGreaterThan(10);
	});
});
