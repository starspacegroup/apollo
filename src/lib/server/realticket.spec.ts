import { describe, expect, it } from 'vitest';
import { readTicket } from './ticket';

/**
 * A ticket minted by the REAL hub construction, handed in by the environment.
 *
 * The other spec mints with a copy of `dirac-gate.ts`'s code, which proves the
 * reader matches that copy and nothing else. This one proves it matches the
 * hub — different repository, different runtime (Bun's `CryptoHasher` against
 * WebCrypto's `HMAC`), same bytes. It skips when the probe is not in the
 * environment, so CI stays green without the secret.
 */
describe.skipIf(!process.env.PROBE_TICKET)('a ticket minted by the hub itself', () => {
	it('is accepted at this end', async () => {
		const r = await readTicket(process.env.PROBE_TICKET!, process.env.PROBE_SECRET!);
		expect(r).toMatchObject({ ok: true });
		if (r.ok) {
			expect(r.ticket.aud).toBe('apollo');
			expect(r.ticket.sub).toBe('293484886726279168');
		}
	});
});
