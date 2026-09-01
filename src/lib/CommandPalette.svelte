<script lang="ts">
	import { onMount } from 'svelte';
	import { sessionStore, allSessions, type ChatSession } from './stores/sessionStore';
	import { paletteActions } from './stores/palette';

	let {
		isOpen = $bindable(false),
		onSessionSelect = (session: ChatSession) => {},
		onNewSession = () => {}
	}: {
		isOpen?: boolean;
		onSessionSelect?: (session: ChatSession) => void;
		onNewSession?: () => void;
	} = $props();

	let searchQuery = $state('');
	let selectedIndex = $state(0);
	let searchInput = $state<HTMLInputElement | null>(null);

	// Command categories
	type Command = {
		id: string;
		label: string;
		description: string;
		category: 'action' | 'session' | 'navigation';
		action?: () => void;
		session?: ChatSession;
		icon: string;
	};

	// Build commands list
	const commands = $derived.by(() => {
		const baseCommands: Command[] = [
			{
				id: 'new-chat',
				label: 'New Chat',
				description: 'Start a new conversation',
				category: 'action',
				icon: 'chat',
				action: () => {
					onNewSession();
					close();
				}
			},
			{
				id: 'new-voice',
				label: 'New Voice Chat',
				description: 'Start a new voice conversation',
				category: 'navigation',
				icon: 'voice',
				action: () => {
					window.location.href = '/voice';
					close();
				}
			}
		];

		// What the open chat can actually do, registered by it when it mounted.
		// A command appears only while something is behind it.
		const a = $paletteActions;
		if (a.voice) {
			baseCommands.push({
				id: 'talk',
				label: 'Talk to Apollo',
				description: 'Realtime voice — speak and be answered aloud',
				category: 'action',
				icon: 'voice',
				action: () => {
					a.voice?.();
					close();
				}
			});
		}
		if (a.attach) {
			baseCommands.push({
				id: 'attach',
				label: 'Attach a file',
				description: 'An image or a text file, into the next message',
				category: 'action',
				icon: 'chat',
				action: () => {
					a.attach?.();
					close();
				}
			});
		}
		if (a.camera) {
			baseCommands.push({
				id: 'camera',
				label: 'Take a photo',
				description: 'Use the camera and attach the shot',
				category: 'action',
				icon: 'chat',
				action: () => {
					a.camera?.();
					close();
				}
			});
		}
		if (a.changeRepo) {
			baseCommands.push({
				id: 'repo',
				label: 'Change repository',
				description: 'Point this conversation at another repo',
				category: 'navigation',
				icon: 'history',
				action: () => {
					a.changeRepo?.();
					close();
				}
			});
		}

		// Add sessions as commands
		const sessionCommands: Command[] = $allSessions.map((session) => ({
			id: `session-${session.id}`,
			label: session.title,
			description: `Last updated ${formatDate(session.updatedAt)}`,
			category: 'session',
			icon: 'history',
			session,
			action: () => {
				onSessionSelect(session);
				close();
			}
		}));

		return [...baseCommands, ...sessionCommands];
	});

	// Filter commands based on search query
	const filteredCommands = $derived.by(() => {
		if (!searchQuery.trim()) {
			return commands;
		}

		const query = searchQuery.toLowerCase();
		return commands.filter(
			(cmd) =>
				cmd.label.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query)
		);
	});

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function close() {
		isOpen = false;
		searchQuery = '';
		selectedIndex = 0;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				close();
				break;
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (filteredCommands[selectedIndex]) {
					filteredCommands[selectedIndex].action?.();
				}
				break;
		}
	}

	function handleCommandClick(command: Command) {
		command.action?.();
	}

	// Focus input when opened
	$effect(() => {
		if (isOpen && searchInput) {
			searchInput.focus();
		}
	});

	// Reset selected index when search changes
	$effect(() => {
		searchQuery; // Track dependency
		selectedIndex = 0;
	});

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

{#if isOpen}
	<div
		class="command-palette-backdrop"
		onclick={close}
		onkeydown={(e) => e.key === 'Enter' && close()}
		role="button"
		tabindex="-1"
	>
		<div
			class="command-palette"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="search-container">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="search-icon"
				>
					<circle cx="11" cy="11" r="8"></circle>
					<path d="m21 21-4.35-4.35"></path>
				</svg>
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					type="text"
					placeholder="Type a command or search..."
					class="search-input"
				/>
				{#if searchQuery}
					<button class="clear-button" onclick={() => (searchQuery = '')} aria-label="Clear search">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				{/if}
			</div>

			<div class="commands-list">
				{#if filteredCommands.length === 0}
					<div class="empty-state">
						<p>No results found</p>
						<p class="empty-state-hint">Try a different search term</p>
					</div>
				{:else}
					{#each filteredCommands as command, index}
						<button
							class="command-item"
							class:selected={index === selectedIndex}
							onclick={() => handleCommandClick(command)}
							onmouseenter={() => (selectedIndex = index)}
						>
							<div class="command-icon">
								{#if command.icon === 'chat'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
									</svg>
								{:else if command.icon === 'voice'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
										<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
										<line x1="12" y1="19" x2="12" y2="23"></line>
										<line x1="8" y1="23" x2="16" y2="23"></line>
									</svg>
								{:else if command.icon === 'history'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<circle cx="12" cy="12" r="10"></circle>
										<polyline points="12 6 12 12 16 14"></polyline>
									</svg>
								{/if}
							</div>
							<div class="command-content">
								<div class="command-label">{command.label}</div>
								<div class="command-description">{command.description}</div>
							</div>
							{#if command.category === 'action'}
								<div class="command-badge">Action</div>
							{:else if command.category === 'session'}
								<div class="command-badge">Session</div>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="command-palette-footer">
				<div class="footer-hint">
					<kbd>↑↓</kbd> Navigate
					<kbd>Enter</kbd> Select
					<kbd>Esc</kbd> Close
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
		z-index: 10000;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.command-palette {
		width: 90%;
		max-width: 640px;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		max-height: 60vh;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.search-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
	}

	.search-icon {
		color: #666;
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #e5e5e5;
		font-size: 1rem;
		outline: none;
	}

	.search-input::placeholder {
		color: #666;
	}

	.clear-button {
		background: transparent;
		border: none;
		color: #666;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		transition: all 0.2s;
	}

	.clear-button:hover {
		color: #999;
		background: #2a2a2a;
	}

	.commands-list {
		overflow-y: auto;
		max-height: calc(60vh - 120px);
		padding: 0.5rem;
	}

	.command-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
		margin-bottom: 0.25rem;
	}

	.command-item:hover,
	.command-item.selected {
		background: #2a2a2a;
	}

	.command-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 0.375rem;
		background: #0a0a0a;
		color: #667eea;
		flex-shrink: 0;
	}

	.command-content {
		flex: 1;
		min-width: 0;
	}

	.command-label {
		color: #e5e5e5;
		font-size: 0.9375rem;
		font-weight: 500;
		margin-bottom: 0.125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.command-description {
		color: #666;
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.command-badge {
		padding: 0.25rem 0.5rem;
		background: #2a2a2a;
		color: #999;
		font-size: 0.75rem;
		border-radius: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
	}

	.empty-state p {
		color: #666;
		margin: 0;
		font-size: 0.9375rem;
	}

	.empty-state-hint {
		margin-top: 0.5rem !important;
		font-size: 0.8125rem !important;
		color: #555 !important;
	}

	.command-palette-footer {
		padding: 0.75rem 1.25rem;
	}

	.footer-hint {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: #666;
		font-size: 0.8125rem;
	}

	kbd {
		padding: 0.25rem 0.5rem;
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 0.25rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.75rem;
		color: #999;
		min-width: 24px;
		text-align: center;
	}

	/* Scrollbar */
	.commands-list::-webkit-scrollbar {
		width: 8px;
	}

	.commands-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.commands-list::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 4px;
	}

	.commands-list::-webkit-scrollbar-thumb:hover {
		background: #444;
	}

	@media (max-width: 768px) {
		.command-palette-backdrop {
			padding-top: 10vh;
		}

		.command-palette {
			width: 95%;
			max-height: 70vh;
		}

		.footer-hint {
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}
</style>
