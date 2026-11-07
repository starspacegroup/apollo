import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The front door is Live: what the team is doing, as it happens. */
export const load: PageServerLoad = async () => {
	throw redirect(303, '/live');
};
