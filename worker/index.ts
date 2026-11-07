// The Worker's entry: SvelteKit's generated worker, plus the Durable Object
// the Activity's voice relay lives in. wrangler bundles this file; the
// SvelteKit build must have run first (`bun run build`). Outside `src` so
// svelte-check does not follow the import into the generated worker, and
// the adapter is pointed at wrangler.build.jsonc so it never writes here.
//
// The relay's upgrade is answered here, before SvelteKit: a 101 from a
// Durable Object has immutable headers, and SvelteKit's cookie pass throws
// on them ("Can't modify immutable headers"). Nothing else is routed here.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { VoiceRelay } from '../src/lib/server/relay';

export { VoiceRelay };

const RELAY_PATH = '/api/activity/voice/relay';

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (new URL(req.url).pathname === RELAY_PATH) {
			return env.VOICE_RELAY.get(env.VOICE_RELAY.idFromName('hub')).fetch(req);
		}
		return (app as { fetch(r: Request, e: Env, c: ExecutionContext): Promise<Response> }).fetch(
			req,
			env,
			ctx
		);
	}
};
