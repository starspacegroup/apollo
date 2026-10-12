import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

/**
 * The bot's user id is the application id: the page lights the team up
 * when Discord says that account is speaking in the channel.
 */
export const load: PageServerLoad = async () => {
	return { clientId: env.DISCORD_CLIENT_ID ?? '' };
};
