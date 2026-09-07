<script lang="ts">
	import type { PageData } from './$types';
	import { signIn } from '@auth/sveltekit/client';
	import { untrack } from 'svelte';

	let { data }: { data: PageData } = $props();
	// A local copy the page keeps current itself, reloading after each
	// change; the load's value is only the starting point.
	let access = $state(untrack(() => data.access));
	let error = $state(untrack(() => data.error));
	let busy = $state(false);
	let picking: Record<string, string> = $state({});

	const session = $derived(data.session);
	const isOwner = $derived(access?.me.role === 'owner');

	async function reload() {
		const res = await fetch('/api/access');
		if (res.ok) {
			access = await res.json();
			error = null;
		} else {
			error =
				((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`;
		}
	}

	async function post(body: Record<string, string>) {
		busy = true;
		try {
			const res = await fetch('/api/access', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				error =
					((await res.json().catch(() => ({}))) as { error?: string }).error ??
					`HTTP ${res.status}`;
				return;
			}
			await reload();
		} finally {
			busy = false;
		}
	}

	function grantsOf(member: string) {
		return (access?.grants ?? []).filter((g) => g.member === member);
	}

	function when(t: number) {
		const d = new Date(t * 1000);
		return d.toLocaleString();
	}
</script>

<svelte:head>
	<title>Apollo · access</title>
</svelte:head>

<main class="access">
	<header>
		<a class="back" href="/board">← board</a>
		<h1>Who may see what</h1>
		<p class="sub">
			A person who has signed in is a member. The owner sees and does everything and grants access;
			an admin sees and does everything on every project; a guest has exactly the grants below. On a
			project, <b>view</b> sees it, <b>member</b> may also ask for work on it, and
			<b>manager</b> may also pause it, switch a capability off, cap its autonomy, name its team and
			mark its attention seen. Nothing here can raise anything on the machine.
		</p>
	</header>

	{#if !session}
		<p class="note">
			Sign in first. <button onclick={() => signIn('discord')}>Sign in with Discord</button>
		</p>
	{:else if error && !access}
		<p class="note bad">{error}</p>
	{:else if access}
		{#if error}<p class="note bad">{error}</p>{/if}
		{#if access.members.length === 0}
			<p class="note">Nobody has signed in yet.</p>
		{/if}
		<div class="members">
			{#each access.members as m (m.id)}
				<section class="member" class:me={m.id === access.me.id}>
					<div class="who">
						{#if m.avatar}<img src={m.avatar} alt="" />{:else}<span class="initial"
								>{m.name.slice(0, 1)}</span
							>{/if}
						<div>
							<b>{m.name}</b>
							<span class="id">{m.id}</span>
							<span class="seen">last seen {when(m.last_seen)}</span>
						</div>
						<div class="role">
							{#if isOwner && m.id !== access.me.id}
								<select
									disabled={busy}
									value={m.role}
									onchange={(e) =>
										post({ member: m.id, role: (e.currentTarget as HTMLSelectElement).value })}
								>
									{#each access.roles as r}<option value={r}>{r}</option>{/each}
								</select>
							{:else}
								<span class="chip {m.role}">{m.role}</span>
							{/if}
						</div>
					</div>
					{#if m.role === 'guest'}
						<div class="grants">
							{#each grantsOf(m.id) as g (g.project)}
								<div class="grant">
									<span class="project">{g.project === '*' ? 'every project' : g.project}</span>
									{#if isOwner}
										<select
											disabled={busy}
											value={g.level}
											onchange={(e) =>
												post({
													member: m.id,
													project: g.project,
													level: (e.currentTarget as HTMLSelectElement).value
												})}
										>
											{#each access.levels as l}<option value={l}
													>{l === 'none' ? 'remove' : l}</option
												>{/each}
										</select>
									{:else}
										<span class="chip">{g.level}</span>
									{/if}
								</div>
							{:else}
								<p class="faint">no access to any project</p>
							{/each}
							{#if isOwner}
								<div class="grant add">
									<select bind:value={picking[m.id]} disabled={busy}>
										<option value="">add a project…</option>
										<option value="*">every project</option>
										{#each access.projects.filter((p) => !grantsOf(m.id).some((g) => g.project === p)) as p}
											<option value={p}>{p}</option>
										{/each}
									</select>
									{#each ['view', 'member', 'manager'] as l}
										<button
											disabled={busy || !picking[m.id]}
											onclick={() => {
												const project = picking[m.id];
												picking[m.id] = '';
												post({ member: m.id, project, level: l });
											}}
										>
											{l}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<p class="faint">sees and may do everything on every project</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<style>
	.access {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		color: var(--text, #c9d1dc);
	}
	header h1 {
		margin: 0.4rem 0 0.3rem;
		font-size: 1.4rem;
	}
	.sub {
		color: var(--dim, #8b95a5);
		max-width: 52rem;
		line-height: 1.45;
	}
	.back {
		color: var(--dim, #8b95a5);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.note {
		padding: 0.6rem 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.5rem;
	}
	.note.bad {
		border-color: rgba(255, 106, 77, 0.5);
		color: #ff6a4d;
	}
	.members {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin-top: 1rem;
	}
	.member {
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.6rem;
		padding: 0.8rem 0.9rem;
		background: rgba(255, 255, 255, 0.025);
	}
	.member.me {
		border-color: rgba(89, 217, 255, 0.35);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.who img,
	.who .initial {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		font-weight: 700;
	}
	.who > div {
		display: flex;
		flex-direction: column;
	}
	.who .role {
		margin-left: auto;
	}
	.id,
	.seen,
	.faint {
		color: var(--faint, #6b7280);
		font-size: 0.8rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.chip {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 999px;
		font-size: 0.8rem;
	}
	.chip.owner {
		color: #ffb14e;
		border-color: rgba(255, 177, 78, 0.5);
	}
	.chip.admin {
		color: #59d9ff;
		border-color: rgba(89, 217, 255, 0.5);
	}
	.grants {
		margin-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.grant {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.grant .project {
		min-width: 12rem;
	}
	.grant.add {
		margin-top: 0.3rem;
		padding-top: 0.5rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.1);
	}
	select,
	button {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.25rem 0.55rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
