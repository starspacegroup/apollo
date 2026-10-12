import type { PageLoad } from './$types';

/** The project page fetches for itself and polls; nothing to load up front. */
export const load: PageLoad = async ({ params, url }) => {
	return { project: params.project, room: url.searchParams.get('room') };
};
