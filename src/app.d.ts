// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}

		interface Session {
			user?: {
				id: string;
				name?: string | null;
				email?: string | null;
				image?: string | null;
				username?: string;
			};
			accessToken?: string;
		}

		interface PageData {
			session: Session | null;
		}
	}
}

export {};
