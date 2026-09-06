import type { LayoutServerLoad } from './$types';

/**
 * The session, once, for every page. Pages read `data.session`; there is no
 * per-page load repeating this call.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const session = await locals.auth();
	return { session };
};
