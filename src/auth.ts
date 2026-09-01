import { SvelteKitAuth, type DefaultSession } from '@auth/sveltekit';
import GitHub from '@auth/core/providers/github';
import { env } from '$env/dynamic/private';

/**
 * `$env/dynamic/private`, not `$env/static/private`.
 *
 * plans/revival.md §2.2, and docs/state-of-the-build.md names it as the one
 * real breakage in the dormant half: the static import BAKES THESE VALUES INTO
 * THE BUNDLE AT BUILD TIME. On a Worker, secrets come from the platform at
 * runtime — so the static form both fails the build when they are absent and
 * ships them inside the artifact when they are present. Two bad outcomes from
 * one import.
 */
const GITHUB_CLIENT_ID = env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = env.GITHUB_CLIENT_SECRET ?? '';
const AUTH_SECRET = env.AUTH_SECRET ?? '';

declare module '@auth/sveltekit' {
	interface Session {
		accessToken?: string;
		user?: {
			id?: string;
			username?: string;
		} & DefaultSession['user'];
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		GitHub({
			clientId: GITHUB_CLIENT_ID,
			clientSecret: GITHUB_CLIENT_SECRET,
			authorization: {
				params: {
					scope: 'read:user user:email repo', // Scopes needed for GitHub API access
					prompt: 'consent' // Always show the GitHub authorization page to allow permission changes
				}
			}
		})
	],
	secret: AUTH_SECRET,
	trustHost: true,
	callbacks: {
		async jwt({ token, account, profile }) {
			// Persist the OAuth access_token and user info to the token
			if (account) {
				token.accessToken = account.access_token;
				token.userId = profile?.id;
				token.username = profile?.login;
			}
			return token;
		},
		async session({ session, token }) {
			// Send properties to the client session
			if (token && session.user) {
				session.accessToken = token.accessToken as string;
				session.user.id = token.userId as string;
				session.user.username = token.username as string;
			}
			return session;
		}
	}
});
