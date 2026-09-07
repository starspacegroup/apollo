import type { PageLoad } from './$types';

export interface AccessData {
	me: { id: string; role: 'owner' | 'admin' | 'guest' };
	members: {
		id: string;
		name: string;
		avatar: string | null;
		role: 'owner' | 'admin' | 'guest';
		first_seen: number;
		last_seen: number;
	}[];
	grants: {
		member: string;
		project: string;
		level: string;
		granted_by: string;
		granted_at: number;
	}[];
	projects: string[];
	levels: string[];
	roles: string[];
}

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/access');
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		return { access: null as AccessData | null, error: body.error ?? `HTTP ${res.status}` };
	}
	return { access: (await res.json()) as AccessData, error: null as string | null };
};
