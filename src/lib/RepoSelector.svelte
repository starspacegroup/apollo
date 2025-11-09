<script lang="ts">
	import { repoStore } from './stores/repoStore';
	import { onMount } from 'svelte';
	import { signIn } from '@auth/sveltekit/client';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	interface GitHubRepo {
		id: number;
		full_name: string;
		name: string;
		description: string | null;
		private: boolean;
		updated_at: string;
		owner: {
			login: string;
			type: string;
		};
	}

	let { session } = $props<{ session: any }>();
	let isOpen = $state(false);
	let repoInput = $state('');
	let error = $state('');
	let isValidating = $state(false);
	let repositories = $state<GitHubRepo[]>([]);
	let isLoadingRepos = $state(false);
	let showManualInput = $state(false);
	let searchQuery = $state('');

	// Check if we need to show the modal
	onMount(() => {
		if (session?.user) {
			const savedRepo = repoStore.get();
			if (!savedRepo) {
				isOpen = true;
				loadRepositories();
			}
		}

		// Check if we just came back from reauthorization
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('reauth') === 'true') {
			// Clear the URL parameter
			const newUrl = window.location.pathname;
			window.history.replaceState({}, '', newUrl);
			// Reload repositories
			if (session?.user) {
				repositories = [];
				loadRepositories();
			}
		}
	});

	// Export method to open modal from parent
	export function openModal() {
		if (session?.user) {
			isOpen = true;
			if (repositories.length === 0) {
				loadRepositories();
			}
		}
	}

	// Export method to reload repositories (e.g., after reauthentication)
	export function reloadRepositories() {
		if (session?.user) {
			repositories = [];
			loadRepositories();
		}
	}

	async function loadRepositories() {
		if (!session?.accessToken) return;

		isLoadingRepos = true;
		error = '';

		try {
			// Fetch ALL repositories with pagination
			let allRepos: GitHubRepo[] = [];
			let page = 1;
			let hasMore = true;

			while (hasMore) {
				const response = await fetch(
					`https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=updated`,
					{
						headers: {
							Authorization: `Bearer ${session.accessToken}`,
							Accept: 'application/vnd.github.v3+json'
						}
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					console.error('GitHub API error:', response.status, errorText);
					throw new Error(`Failed to fetch repositories: ${response.status}`);
				}

				const reposData = (await response.json()) as GitHubRepo[];

				if (reposData.length === 0) {
					hasMore = false;
				} else {
					allRepos = [...allRepos, ...reposData];
					// GitHub API returns up to 100 items per page
					if (reposData.length < 100) {
						hasMore = false;
					} else {
						page++;
					}
				}

				// Safety limit to prevent infinite loops
				if (page > 10) {
					console.warn('Reached maximum page limit (1000 repos)');
					hasMore = false;
				}
			}

			// Sort by most recently updated
			repositories = allRepos.sort(
				(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);

			console.log(`Loaded ${repositories.length} repositories from ${page} page(s)`);
		} catch (err) {
			console.error('Error loading repositories:', err);
			error = 'Failed to load repositories. You can enter manually below.';
			showManualInput = true;
		} finally {
			isLoadingRepos = false;
		}
	}

	async function validateRepo(repo: string): Promise<boolean> {
		// Basic format validation
		const repoPattern = /^[\w-]+\/[\w.-]+$/;
		if (!repoPattern.test(repo)) {
			error = 'Please enter a valid repository in the format: owner/repo';
			return false;
		}

		// Try to validate with GitHub API if we have access token
		if (session?.accessToken) {
			try {
				isValidating = true;
				const response = await fetch(`https://api.github.com/repos/${repo}`, {
					headers: {
						Authorization: `Bearer ${session.accessToken}`,
						Accept: 'application/vnd.github.v3+json'
					}
				});

				if (!response.ok) {
					if (response.status === 404) {
						error = 'Repository not found. Please check the owner and repo name.';
					} else if (response.status === 403) {
						error = 'Access denied. You may not have permission to view this repository.';
					} else {
						error = 'Failed to validate repository. Please try again.';
					}
					return false;
				}
				return true;
			} catch (err) {
				error = 'Network error. Please check your connection and try again.';
				return false;
			} finally {
				isValidating = false;
			}
		}

		return true;
	}

	function selectRepo(fullName: string) {
		const currentRepo = repoStore.get();
		repoStore.set(fullName);
		isOpen = false;
		repoInput = '';
		error = '';
		searchQuery = '';
		
		// If switching to a different repo and not on home page, navigate to home
		if (browser && currentRepo !== fullName && window.location.pathname !== '/') {
			goto('/');
		}
	}

	async function handleSubmit() {
		error = '';
		const trimmedRepo = repoInput.trim();

		if (!trimmedRepo) {
			error = 'Please enter a repository';
			return;
		}

		const isValid = await validateRepo(trimmedRepo);
		if (isValid) {
			const currentRepo = repoStore.get();
			repoStore.set(trimmedRepo);
			isOpen = false;
			repoInput = '';
			error = '';
			
			// If switching to a different repo and not on home page, navigate to home
			if (browser && currentRepo !== trimmedRepo && window.location.pathname !== '/') {
				goto('/');
			}
		}
	}

	function handleClose() {
		// Only allow closing if a repo is already selected
		if (repoStore.get()) {
			isOpen = false;
			repoInput = '';
			error = '';
			searchQuery = '';
			showManualInput = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSubmit();
		}
	}

	const filteredRepos = $derived(
		repositories.filter(
			(repo) =>
				repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(repo.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
		)
	);
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleClose}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Select GitHub Repository</h2>
				{#if repoStore.get()}
					<button class="close-btn" onclick={handleClose} aria-label="Close">&times;</button>
				{/if}
			</div>
			<p class="modal-description">
				Choose a repository you'd like to work with. This will be saved for your current session.
			</p>

			{#if isLoadingRepos}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading all your repositories from all organizations...</p>
					<p class="loading-subtext">This may take a moment if you have many repositories</p>
				</div>
			{:else if !showManualInput && repositories.length > 0}
				<div class="repo-selection">
					<div class="repo-header">
						<div class="info-banner">
							<span class="info-icon">ℹ️</span>
							<span>Don't see a repository? Refresh your GitHub access to update permissions.</span>
						</div>
						<button
							class="btn-refresh"
							onclick={() => {
								const callbackUrl = new URL(window.location.href);
								callbackUrl.searchParams.set('reauth', 'true');
								signIn('github', {
									redirect: true,
									callbackUrl: callbackUrl.toString()
								});
							}}
							title="Reauthenticate with GitHub to select organizations and repositories"
						>
							🔄 Refresh Access
						</button>
					</div>

					<div class="search-box">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search repositories..."
							class="search-input"
						/>
					</div>

					<div class="repo-list">
						{#each filteredRepos as repo (repo.id)}
							<button class="repo-item" onclick={() => selectRepo(repo.full_name)}>
								<div class="repo-item-header">
									<span class="repo-name">{repo.full_name}</span>
									{#if repo.owner.type === 'Organization'}
										<span class="badge organization">🏢 Org</span>
									{/if}
									{#if repo.private}
										<span class="badge private">🔒 Private</span>
									{/if}
								</div>
								{#if repo.description}
									<p class="repo-description">{repo.description}</p>
								{/if}
							</button>
						{/each}
						{#if filteredRepos.length === 0}
							<div class="no-results">No repositories match your search.</div>
						{:else if filteredRepos.length > 0}
							<div class="repo-count">
								Showing {filteredRepos.length}
								{filteredRepos.length === 1 ? 'repository' : 'repositories'}
							</div>
						{/if}
					</div>

					<button class="link-btn" onclick={() => (showManualInput = true)}>
						Or enter repository manually
					</button>
				</div>
			{:else}
				<div class="form-group">
					<label for="repo-input">Repository (owner/repo)</label>
					<input
						id="repo-input"
						type="text"
						bind:value={repoInput}
						onkeydown={handleKeydown}
						placeholder="e.g., facebook/react"
						class="repo-input"
						disabled={isValidating}
					/>
					<span class="input-help">Format: owner/repository-name</span>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<div class="modal-actions">
					<button onclick={handleSubmit} class="btn btn-primary" disabled={isValidating}>
						{#if isValidating}
							Validating...
						{:else}
							Continue
						{/if}
					</button>
					{#if repositories.length > 0}
						<button class="btn btn-secondary" onclick={() => (showManualInput = false)}>
							Back to List
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Dark theme CSS variables */
	:global([data-theme='dark']) {
		--modal-backdrop: rgba(0, 0, 0, 0.85);
		--modal-bg: #111111;
		--modal-border: #222222;
		--modal-text: #e5e5e5;
		--modal-text-secondary: #999999;
		--modal-text-muted: #666666;
		--modal-input-bg: #1a1a1a;
		--modal-input-border: #2a2a2a;
		--modal-input-focus: #667eea;
		--modal-button-hover: #2a2a2a;
		--modal-error-bg: #2a1515;
		--modal-error-text: #ff6b6b;
		--modal-error-border: #dc2626;
		--modal-loading-spinner: #667eea;
		--modal-loading-track: #2a2a2a;
		--modal-info-bg: #1a2332;
		--modal-info-border: #2d3f5f;
		--modal-info-text: #7fb3ff;
		--modal-repo-item-bg: #0a0a0a;
		--modal-repo-item-hover: #1a1a1a;
		--modal-repo-item-active: #252525;
		--modal-repo-list-bg: #0a0a0a;
		--modal-repo-list-border: #2a2a2a;
		--modal-badge-private-bg: #3a2f1a;
		--modal-badge-private-text: #fbbf24;
		--modal-badge-org-bg: #1a2332;
		--modal-badge-org-text: #7fb3ff;
		--modal-count-bg: #0f0f0f;
		--modal-link-text: #8b9aff;
		--modal-link-hover: #a8b3ff;
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--modal-backdrop);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--modal-bg);
		border: 1px solid var(--modal-border);
		border-radius: 1rem;
		padding: 2rem;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.5),
			0 8px 10px -6px rgb(0 0 0 / 0.4);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		color: var(--modal-text-muted);
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: var(--modal-text-secondary);
	}

	h2 {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--modal-text);
		margin: 0;
	}

	.modal-description {
		color: var(--modal-text-secondary);
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--modal-text);
	}

	.repo-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 2px solid var(--modal-input-border);
		border-radius: 0.5rem;
		font-size: 1rem;
		transition: all 0.2s;
		font-family: 'Monaco', 'Courier New', monospace;
		background: var(--modal-input-bg);
		color: var(--modal-text);
	}

	.repo-input:focus {
		outline: none;
		border-color: var(--modal-input-focus);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
	}

	.repo-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		filter: brightness(0.8);
	}

	.input-help {
		display: block;
		font-size: 0.875rem;
		color: var(--modal-text-muted);
		margin-top: 0.375rem;
	}

	.error-message {
		background: var(--modal-error-bg);
		color: var(--modal-error-text);
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		border-left: 4px solid var(--modal-error-border);
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		font-size: 1rem;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	.btn-secondary {
		background: var(--modal-input-bg);
		color: #667eea;
		border: 2px solid #667eea;
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--modal-button-hover);
	}

	.loading-state {
		text-align: center;
		padding: 3rem 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		margin: 0 auto 1rem;
		border: 4px solid var(--modal-loading-track);
		border-top-color: var(--modal-loading-spinner);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		color: var(--modal-text-secondary);
		margin: 0;
	}

	.loading-subtext {
		font-size: 0.875rem;
		color: var(--modal-text-muted);
		margin-top: 0.5rem !important;
	}

	.repo-selection {
		margin-top: 1rem;
	}

	.repo-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.info-banner {
		background: var(--modal-info-bg);
		border: 1px solid var(--modal-info-border);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--modal-info-text);
		line-height: 1.5;
		flex: 1;
	}

	.info-icon {
		flex-shrink: 0;
		font-size: 1rem;
	}

	.btn-refresh {
		padding: 0.75rem 1.25rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.9rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-refresh:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	.btn-refresh:active {
		transform: translateY(0);
	}

	.search-box {
		margin-bottom: 1rem;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 2px solid var(--modal-input-border);
		border-radius: 0.5rem;
		font-size: 1rem;
		transition: all 0.2s;
		background: var(--modal-input-bg);
		color: var(--modal-text);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--modal-input-focus);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
	}

	.repo-list {
		max-height: 400px;
		overflow-y: auto;
		border: 2px solid var(--modal-repo-list-border);
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		background: var(--modal-repo-list-bg);
	}

	.repo-item {
		width: 100%;
		padding: 1rem;
		border: none;
		background: var(--modal-repo-item-bg);
		text-align: left;
		cursor: pointer;
		transition: background 0.2s;
	}

	.repo-item:last-child {
		border-bottom: none;
	}

	.repo-item:hover {
		background: var(--modal-repo-item-hover);
	}

	.repo-item:active {
		background: var(--modal-repo-item-active);
	}

	.repo-item-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.repo-name {
		font-weight: 600;
		color: var(--modal-text);
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.95rem;
	}

	.badge {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		font-weight: 600;
	}

	.badge.private {
		background: var(--modal-badge-private-bg);
		color: var(--modal-badge-private-text);
	}

	.badge.organization {
		background: var(--modal-badge-org-bg);
		color: var(--modal-badge-org-text);
	}

	.repo-description {
		color: var(--modal-text-secondary);
		font-size: 0.875rem;
		margin: 0;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.no-results {
		padding: 2rem;
		text-align: center;
		color: var(--modal-text-muted);
	}

	.repo-count {
		padding: 0.75rem 1rem;
		text-align: center;
		color: var(--modal-text-secondary);
		font-size: 0.875rem;
		background: var(--modal-count-bg);
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--modal-link-text);
		font-weight: 600;
		cursor: pointer;
		padding: 0.5rem;
		width: 100%;
		text-align: center;
		transition: color 0.2s;
	}

	.link-btn:hover {
		color: var(--modal-link-hover);
		text-decoration: underline;
	}
</style>
