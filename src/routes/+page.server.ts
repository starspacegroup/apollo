export const load = async (event: any) => {
	const session = await event.locals.auth();

	return {
		session
	};
};
