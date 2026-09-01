<script lang="ts">
	import {
		sessionStore,
		allSessions,
		currentSession,
		type ChatSession
	} from './stores/sessionStore';
	import { onMount } from 'svelte';
	import { signOut } from '@auth/sveltekit/client';
	import CommandPalette from './CommandPalette.svelte';
	import { paletteOpen } from './stores/palette';
	import { goto } from '$app/navigation';

	let {
		onSessionSelect = (session: ChatSession) => {},
		onNewSession = () => {},
		onStartVoice = () => {},
		isCollapsed = $bindable(false),
		session = null
	}: {
		onSessionSelect?: (session: ChatSession) => void;
		onNewSession?: () => void;
		onStartVoice?: () => void;
		isCollapsed?: boolean;
		session?: any;
	} = $props();

	let editingSessionId = $state<string | null>(null);
	let editTitle = $state('');
	let showUserMenu = $state(false);
	let activeNav = $state('chat'); // Default to chat view
	let userMenuButton = $state<HTMLButtonElement | null>(null);

	// Load collapsed state from localStorage on mount
	onMount(() => {
		const savedState = localStorage.getItem('sidebarCollapsed');

		// On mobile/tablet, default to collapsed unless explicitly expanded
		if (window.innerWidth <= 768) {
			isCollapsed = savedState === 'false' ? false : true;
		} else {
			// On desktop, use saved state or default to expanded
			isCollapsed = savedState === 'true';
		}

		// Add keyboard listener for ESC key on mobile and Ctrl+K for command palette
		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape key on mobile
			if (e.key === 'Escape' && !isCollapsed && window.innerWidth <= 768) {
				toggleCollapsed();
			}

			// Ctrl+K or Cmd+K for command palette
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault();
				paletteOpen.update((v) => !v);
			}
		};

		// Handle clicks outside the user menu
		const handleClickOutside = (e: MouseEvent) => {
			if (showUserMenu) {
				const target = e.target as Node;
				const userMenu = document.querySelector('.user-dropdown');
				const userButton = userMenuButton;

				if (userMenu && !userMenu.contains(target) && userButton && !userButton.contains(target)) {
					showUserMenu = false;
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function toggleCollapsed() {
		isCollapsed = !isCollapsed;
		localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
	}

	function handleNewSession() {
		onNewSession();
	}

	function handleSessionClick(session: ChatSession) {
		sessionStore.switchSession(session.id);
		onSessionSelect(session);
	}

	function handleDeleteSession(sessionId: string, event: Event) {
		event.stopPropagation();
		if (confirm('Are you sure you want to delete this chat session?')) {
			sessionStore.deleteSession(sessionId);
		}
	}

	function startEditingTitle(session: ChatSession, event: Event) {
		event.stopPropagation();
		editingSessionId = session.id;
		editTitle = session.title;
	}

	function saveTitle(sessionId: string) {
		if (editTitle.trim()) {
			sessionStore.updateSessionTitle(sessionId, editTitle.trim());
		}
		editingSessionId = null;
	}

	function cancelEdit() {
		editingSessionId = null;
		editTitle = '';
	}

	function handleKeyDown(event: KeyboardEvent, sessionId: string) {
		if (event.key === 'Enter') {
			saveTitle(sessionId);
		} else if (event.key === 'Escape') {
			cancelEdit();
		}
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Group sessions by date
	function groupSessionsByDate(sessions: ChatSession[]) {
		const groups: { [key: string]: ChatSession[] } = {};

		sessions.forEach((session) => {
			const date = new Date(session.updatedAt);
			const today = new Date();
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);

			let groupKey: string;

			if (date.toDateString() === today.toDateString()) {
				groupKey = 'Today';
			} else if (date.toDateString() === yesterday.toDateString()) {
				groupKey = 'Yesterday';
			} else if (today.getTime() - date.getTime() < 7 * 86400000) {
				groupKey = 'Last 7 Days';
			} else if (today.getTime() - date.getTime() < 30 * 86400000) {
				groupKey = 'Last 30 Days';
			} else {
				groupKey = 'Older';
			}

			if (!groups[groupKey]) {
				groups[groupKey] = [];
			}
			groups[groupKey].push(session);
		});

		return groups;
	}

	const sessionGroups = $derived(groupSessionsByDate($allSessions));
	const groupOrder = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'];

	// Navigation items
	const navItems = [
		{ id: 'chat', label: 'Chat', icon: 'chat' },
		{ id: 'voice', label: 'Voice', icon: 'voice' }
	];

	function handleNavClick(navId: string) {
		activeNav = navId;

		// Handle navigation actions
		if (navId === 'chat') {
			// Navigate to root for new chat and clear current session
			sessionStore.clearCurrentSession();
			goto('/');

			// Close sidebar on mobile after navigation
			if (window.innerWidth <= 480) {
				isCollapsed = true;
			}
		} else if (navId === 'voice') {
			// Navigate to root and activate voice mode
			sessionStore.clearCurrentSession();
			goto('/');
			onStartVoice();

			// Close sidebar on mobile after navigation
			if (window.innerWidth <= 480) {
				isCollapsed = true;
			}
		}

		console.log('Navigation clicked:', navId);
	}

	function handleMenuClick(menuId: string) {
		console.log('Menu clicked:', menuId);
		// Handle menu actions
	}
</script>

<!-- Mobile backdrop overlay -->
{#if !isCollapsed}
	<div
		class="sidebar-backdrop"
		onclick={toggleCollapsed}
		onkeydown={(e) => e.key === 'Enter' && toggleCollapsed()}
		role="button"
		tabindex="-1"
		aria-label="Close sidebar"
	></div>
{/if}

<div class="sessions-sidebar" class:collapsed={isCollapsed}>
	<!-- Apollo Logo -->
	<div class="sidebar-header">
		<h1 class="logo">Apollo</h1>
	</div>

	<!-- Search -->
	<div
		class="sidebar-search"
		onclick={() => paletteOpen.set(true)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && paletteOpen.set(true)}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<circle cx="11" cy="11" r="8"></circle>
			<path d="m21 21-4.35-4.35"></path>
		</svg>
		<input type="text" placeholder="Search Ctrl+K" readonly />
	</div>

	<!-- Navigation Items -->
	<nav class="sidebar-nav">
		{#each navItems as item}
			<button
				class="nav-item"
				class:active={activeNav === item.id}
				onclick={() => handleNavClick(item.id)}
				title={item.label}
			>
				{#if item.icon === 'chat'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
					</svg>
				{:else if item.icon === 'voice'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
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
				{/if}
				<span class="nav-label">{item.label}</span>
			</button>
		{/each}
	</nav>

	<!-- History Section -->
	<div class="sidebar-section">
		<div class="section-header">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="10"></circle>
				<polyline points="12 6 12 12 16 14"></polyline>
			</svg>
			<span>History</span>
		</div>
		<div class="history-list">
			{#if $allSessions.length === 0}
				<div class="empty-history">
					<p>No conversations yet</p>
				</div>
			{:else}
				{#each groupOrder as groupName}
					{#if sessionGroups[groupName] && sessionGroups[groupName].length > 0}
						<div class="history-group">
							<div class="group-label">{groupName}</div>
							{#each sessionGroups[groupName].slice(0, 5) as session}
								<button
									class="history-item"
									class:active={$currentSession?.id === session.id}
									onclick={() => handleSessionClick(session)}
									title={session.title}
								>
									<span class="history-title">{session.title}</span>
								</button>
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>

	<!-- Bottom Menu & User -->
	<div class="sidebar-footer">
		<!-- User Menu -->
		{#if session?.user}
			<button
				class="menu-item user-item"
				onclick={() => (showUserMenu = !showUserMenu)}
				bind:this={userMenuButton}
			>
				{#if session.user.image}
					<img
						src={session.user.image}
						alt={session.user.name || 'User'}
						class="user-avatar-small"
					/>
				{:else}
					<div class="user-avatar-placeholder">
						{session.user.name?.charAt(0) || session.user.username?.charAt(0) || 'U'}
					</div>
				{/if}
				<span class="menu-label">{session.user.name || session.user.username}</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="chevron-up"
					class:open={showUserMenu}
				>
					<polyline points="18 15 12 9 6 15"></polyline>
				</svg>
			</button>
		{/if}

		<!-- Collapse/Expand Toggle -->
		<button
			class="menu-item collapse-btn"
			onclick={toggleCollapsed}
			title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<polyline points="11 17 6 12 11 7"></polyline>
				<polyline points="18 17 13 12 18 7"></polyline>
			</svg>
			<span class="menu-label">Collapse</span>
		</button>
	</div>
</div>

<!-- User Menu Popout (rendered outside sidebar) -->
{#if session?.user && showUserMenu}
	<div
		class="user-dropdown"
		style="
		position: fixed;
		bottom: {userMenuButton
			? window.innerHeight - userMenuButton.getBoundingClientRect().top + 8
			: 0}px;
		left: {userMenuButton ? userMenuButton.getBoundingClientRect().left : 0}px;
		width: {userMenuButton ? userMenuButton.getBoundingClientRect().width : 200}px;
	"
	>
		<button
			class="dropdown-item"
			onclick={() => {
				handleMenuClick('settings');
				showUserMenu = false;
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="3"></circle>
				<path d="M12 1v6m0 6v10m10-10h-6m-6 0H1"></path>
			</svg>
			<span>Settings</span>
		</button>
		<button
			class="dropdown-item"
			onclick={() => {
				console.log('Upgrade plan clicked');
				showUserMenu = false;
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
			</svg>
			<span>Upgrade plan</span>
		</button>
		<button
			class="dropdown-item logout"
			onclick={() => {
				signOut();
				showUserMenu = false;
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
				<polyline points="16 17 21 12 16 7"></polyline>
				<line x1="21" y1="12" x2="9" y2="12"></line>
			</svg>
			<span>Sign Out</span>
		</button>
	</div>
{/if}

<!-- Command Palette -->
<CommandPalette bind:isOpen={$paletteOpen} {onSessionSelect} {onNewSession} />

<style>
	.sidebar-backdrop {
		display: none;
	}

	.sessions-sidebar {
		width: 260px;
		height: 100vh;
		height: 100dvh;
		background: #1a1a1a;
		border-right: 1px solid #2a2a2a;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		transition: width 0.3s ease;
		overflow: hidden;
	}

	.sessions-sidebar.collapsed {
		width: 52px;
	}
	/* Header with Apollo Logo */
	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 56px;
		padding: 0 1rem;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.sessions-sidebar.collapsed .sidebar-header {
		padding: 0 0.5rem;
	}

	.sessions-sidebar.collapsed .logo {
		font-size: 0;
		width: 24px;
		height: 24px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: initial;
		-webkit-text-fill-color: initial;
		background-clip: initial;
		border-radius: 4px;
	}

	.sessions-sidebar.collapsed .logo::before {
		content: 'A';
		font-size: 1rem;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	/* Search */
	.sidebar-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		margin: 0.75rem 0.75rem 0.5rem 0.75rem;
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 0.5rem;
		color: #666;
		transition: all 0.3s ease;
		cursor: pointer;
	}

	.sidebar-search:hover {
		background: #111;
		border-color: #3a3a3a;
	}

	.sessions-sidebar.collapsed .sidebar-search {
		margin: 0.75rem 0.5rem 0.5rem 0.5rem;
		padding: 0.75rem 0.625rem;
		justify-content: center;
	}

	.sessions-sidebar.collapsed .sidebar-search input {
		display: none;
	}

	.sidebar-search input {
		flex: 1;
		background: transparent;
		border: none;
		color: #999;
		font-size: 0.875rem;
		outline: none;
		cursor: pointer;
		pointer-events: none;
	}

	.sidebar-search input::placeholder {
		color: #666;
	}

	/* Navigation */
	.sidebar-nav {
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0.75rem;
		gap: 0.25rem;
	}

	.sessions-sidebar.collapsed .sidebar-nav {
		padding: 0.5rem 0.5rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		background: transparent;
		border: none;
		border-radius: 0.5rem;
		color: #999;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		white-space: nowrap;
	}

	.sessions-sidebar.collapsed .nav-item {
		padding: 0.625rem;
		justify-content: center;
	}

	.sessions-sidebar.collapsed .nav-label {
		display: none;
	}

	.nav-item:hover {
		background: #2a2a2a;
		color: #e5e5e5;
	}

	.nav-item.active {
		background: #2a2a2a;
		color: #fff;
	}

	.nav-label {
		flex: 1;
	}

	/* Sidebar Section (History) */
	.sidebar-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		margin-top: 0.5rem;
	}

	.sessions-sidebar.collapsed .sidebar-section {
		display: none;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.history-list {
		flex: 1;
		overflow-y: auto;
		padding: 0 0.75rem 0.75rem 0.75rem;
	}

	.empty-history {
		padding: 2rem 1rem;
		text-align: center;
		color: #666;
		font-size: 0.875rem;
	}

	.empty-history p {
		margin: 0;
	}

	.history-group {
		margin-bottom: 1rem;
	}

	.group-label {
		font-size: 0.75rem;
		color: #666;
		padding: 0.5rem 0.875rem;
		font-weight: 500;
	}

	.history-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: transparent;
		border: none;
		border-radius: 0.5rem;
		color: #999;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		margin-bottom: 0.125rem;
	}

	.history-item:hover {
		background: #2a2a2a;
		color: #e5e5e5;
	}

	.history-item.active {
		background: #2a2a2a;
		color: #fff;
	}

	.history-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Footer */
	.sidebar-footer {
		padding: 0.5rem 0.75rem 0.75rem 0.75rem;
		margin-top: auto;
		flex-shrink: 0;
	}

	.sessions-sidebar.collapsed .sidebar-footer {
		padding: 0.5rem 0.5rem 0.75rem 0.5rem;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: transparent;
		border: none;
		border-radius: 0.5rem;
		color: #999;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		margin-bottom: 0.125rem;
		white-space: nowrap;
	}

	.sessions-sidebar.collapsed .menu-item {
		padding: 0.625rem;
		justify-content: center;
	}

	.sessions-sidebar.collapsed .menu-label {
		display: none;
	}

	.menu-item:hover {
		background: #2a2a2a;
		color: #e5e5e5;
	}

	.menu-label {
		flex: 1;
	}

	/* Collapse Button */
	.collapse-btn {
		margin-top: 0.25rem;
		padding-top: 0.75rem !important;
	}

	.sessions-sidebar.collapsed .collapse-btn svg {
		transform: rotate(180deg);
	}

	/* User Item */
	.user-item {
		margin-top: 0.25rem;
		padding-top: 0.75rem;
	}

	.sessions-sidebar.collapsed .user-item {
		padding: 0.625rem !important;
	}

	.user-avatar-small {
		width: 32px;
		height: 32px;
		min-width: 32px;
		min-height: 32px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.user-avatar-placeholder {
		width: 32px;
		height: 32px;
		min-width: 32px;
		min-height: 32px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
		flex-shrink: 0;
	}

	.chevron-up {
		margin-left: auto;
		transition: transform 0.2s;
	}

	.sessions-sidebar.collapsed .chevron-up {
		display: none;
	}

	.chevron-up.open {
		transform: rotate(180deg);
	}

	/* User Dropdown */
	.user-dropdown {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 0.5rem;
		padding: 0.25rem;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.2s ease-out;
		z-index: 1000;
		min-width: 200px;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: #e5e5e5;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.dropdown-item:hover {
		background: #3a3a3a;
	}

	.dropdown-item.logout {
		color: #ef4444;
	}

	.dropdown-item.logout:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	/* Scrollbar */
	.history-list::-webkit-scrollbar {
		width: 6px;
	}

	.history-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.history-list::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}

	.history-list::-webkit-scrollbar-thumb:hover {
		background: #444;
	}

	/* Mobile */
	@media (max-width: 768px) {
		.sessions-sidebar {
			position: fixed;
			left: 0;
			top: 0;
			z-index: 100;
			box-shadow: 4px 0 12px rgba(0, 0, 0, 0.3);
			transition: transform 0.3s ease;
		}

		.sessions-sidebar.collapsed {
			transform: translateX(-100%);
			width: 280px; /* Keep full width on mobile, just hide it */
		}

		/* Show backdrop on mobile when sidebar is open (not collapsed) */
		.sidebar-backdrop {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 99;
		}
	}
</style>
