# GitHub Authentication Setup Guide

GitHub authentication has been successfully integrated into your Apollo
SvelteKit app! Follow these steps to complete the configuration.

## 🎯 What Was Implemented

- ✅ Auth.js (NextAuth.js for SvelteKit) with GitHub provider
- ✅ Session management across all pages
- ✅ Protected routes (app requires login)
- ✅ Navigation bar with user info and sign in/out
- ✅ GitHub API access token storage for future API calls
- ✅ TypeScript types for session and user data

## 📋 Setup Steps

### 1. Create a GitHub OAuth App

1. Go to
   [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Apollo App (or your preferred name)
   - **Homepage URL**: `http://localhost:5173` (for development)
   - **Authorization callback URL**:
     `http://localhost:5173/auth/callback/github`
4. Click "Register application"
5. On the next page, click "Generate a new client secret"
6. **Copy both the Client ID and Client Secret** - you'll need these next!

### 2. Configure Environment Variables

Edit the `.env` file in your project root:

```bash
# Replace with your actual GitHub OAuth credentials
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Generate a random secret (see below)
AUTH_SECRET=your_random_secret_here

# Keep these as-is for development
AUTH_TRUST_HOST=true
ORIGIN=http://localhost:5173
```

**Generate AUTH_SECRET:**

On Windows PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Or use an online generator: https://generate-secret.vercel.app/32

### 3. Update Wrangler Configuration (For Cloudflare Deployment)

When deploying to Cloudflare, add your secrets:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put AUTH_SECRET
```

Update `wrangler.jsonc` with your production callback URL:

```jsonc
{
	"vars": {
		"ORIGIN": "https://your-production-domain.com"
	}
}
```

### 4. Update GitHub OAuth App for Production

When deploying to production:

1. Go back to your GitHub OAuth App settings
2. Update the **Homepage URL** to your production domain
3. Update the **Authorization callback URL** to:
   `https://your-domain.com/auth/callback/github`

## 🚀 Running the App

### Development Mode

```bash
npm run dev
```

Visit `http://localhost:5173` and click "Sign in with GitHub"

### Preview/Production Mode

```bash
npm run preview
```

## 🔒 What's Protected

Currently, the app shows authentication status on the home page and displays
user info in the navigation. To enforce authentication on specific routes, you
can add this to any `+page.server.ts`:

```typescript
import { redirect } from '@sveltejs/kit';

export const load = async (event: any) => {
	const session = await event.locals.auth();

	if (!session?.user) {
		throw redirect(303, '/'); // Redirect to home if not authenticated
	}

	return {
		session
	};
};
```

## 🎨 Features Included

### Navigation Bar

- Shows "Sign in with GitHub" button when logged out
- Shows user avatar, name, and "Sign Out" button when logged in

### Home Page

- Authentication status badge
- Disabled features when not authenticated (currently voice chat link)

### Session Data Available

Access the session in any component:

```svelte
<script lang="ts">
	let { data } = $props();
	const session = $derived(data.session);

	// Available data:
	// - session.user.name
	// - session.user.email
	// - session.user.image (avatar)
	// - session.user.username (GitHub username)
	// - session.accessToken (for GitHub API calls)
</script>
```

## 🔧 GitHub API Integration

The access token is stored in the session and can be used with Octokit:

```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
	auth: session.accessToken
});

// Now you can make GitHub API calls
const { data: repos } = await octokit.repos.listForAuthenticatedUser();
```

**Scopes configured**: `read:user`, `user:email`, `repo` (full repo access for
creating issues)

## 📝 Next Steps

1. **Complete the `.env` configuration** with your GitHub OAuth credentials
2. **Test the authentication flow** in development
3. **Add route protection** to pages that require authentication
4. **Implement GitHub Issue creation** using the stored access token
5. **Deploy to Cloudflare** and configure production OAuth settings

## 🐛 Troubleshooting

**"Module not found" errors**: Run `npm run prepare` to sync SvelteKit types

**Authentication loop**: Make sure your callback URL matches exactly (including
trailing slashes)

**Session not persisting**: Check that `AUTH_SECRET` is set and
`AUTH_TRUST_HOST=true`

**Cloudflare deployment issues**: Ensure all secrets are set with
`wrangler secret put`

## 📚 Documentation

- [Auth.js SvelteKit](https://authjs.dev/getting-started/installation?framework=sveltekit)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Octokit REST API](https://octokit.github.io/rest.js/)

---

**Ready to go!** Complete the environment configuration and start the dev server
to test GitHub authentication.
