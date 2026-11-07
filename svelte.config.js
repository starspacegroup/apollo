import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ config: 'wrangler.build.jsonc' }),
		// The Activity reloads itself when a new build is deployed (David,
		// 2026-11-07: "fixes should come through instantly on the activity").
		// `updated` from `$app/state` flips when /_app/version.json changes.
		version: { pollInterval: 20_000 }
	}
};

export default config;
