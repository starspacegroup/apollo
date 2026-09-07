import { SvelteKitAuth, type DefaultSession } from '@auth/sveltekit';
import GitHub from '@auth/core/providers/github';
import Discord from '@auth/core/providers/discord';
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
// Discord is the door (David, 2026-09-07: "log in to it with discord and let
// others log in with discord"). GitHub stays for the repository chat, which
// needs a GitHub token to read repositories. Either identity is a member.
const DISCORD_CLIENT_ID = env.DISCORD_CLIENT_ID ?? '';
const DISCORD_CLIENT_SECRET = env.DISCORD_CLIENT_SECRET ?? '';

declare module '@auth/sveltekit' {
	interface Session {
		accessToken?: string;
		user?: {
			id?: string;
			username?: string;
			/** `discord` or `github` — which door they came in by. */
			provider?: string;
		} & DefaultSession['user'];
	}
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		Discord({
			clientId: DISCORD_CLIENT_ID,
			clientSecret: DISCORD_CLIENT_SECRET,
			authorization: { params: { scope: 'identify' } }
		}),
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
				token.provider = account.provider;
				token.userId = profile?.id;
				// GitHub says `login`; Discord says `username` (and `global_name`
				// for the display name a person chose).
				token.username =
					(profile?.login as string | undefined) ??
					(profile?.global_name as string | undefined) ??
					(profile?.username as string | undefined);
			}
			return token;
		},
		async session({ session, token }) {
			// Send properties to the client session
			if (token && session.user) {
				session.accessToken = token.accessToken as string;
				session.user.id = token.userId as string;
				session.user.username = token.username as string;
				session.user.provider = token.provider as string;
			}
			return session;
		}
	}
});
