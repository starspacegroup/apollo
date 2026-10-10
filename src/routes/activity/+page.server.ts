import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

/**
 * The one thing the door needs from the server before the handshake: which
 * Discord application this is. Not a secret — it is in every Activity URL —
 * but it is the Worker's to say rather than a constant in the bundle, so the
 * app and the daemon keep reading the same id from configuration.
 */
export const load: PageServerLoad = async () => {
	return { clientId: env.DISCORD_CLIENT_ID ?? '' };
};
