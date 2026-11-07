import type { PageLoad } from './$types';

/** The project page fetches for itself and polls; only the application id comes from the server. */
export const load: PageLoad = async ({ params, url, data }) => {
	return { project: params.project, room: url.searchParams.get('room'), clientId: data.clientId };
};
