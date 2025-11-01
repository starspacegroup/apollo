<svelte:head>
	<title>Apollo - SvelteKit App</title>
</svelte:head>

<div class="container">
	<h1>Welcome to Apollo</h1>
	<p>Your SvelteKit application powered by Cloudflare</p>

	<div class="features">
		<a href="/voice" class="feature-card">
			<div class="icon">🎤</div>
			<h2>AI Voice Chat</h2>
			<p>Real-time voice conversation with AI powered by OpenAI and Cloudflare Workers</p>
			<span class="cta">Try it now →</span>
		</a>
	</div>
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 4rem 2rem;
		text-align: center;
	}

	h1 {
		font-size: 3rem;
		font-weight: 700;
		margin-bottom: 1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.container > p {
		font-size: 1.25rem;
		color: #6b7280;
		margin-bottom: 3rem;
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
		margin-top: 3rem;
	}

	.feature-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 1rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.3s ease;
	}

	.feature-card:hover {
		transform: translateY(-8px);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
		border-color: #667eea;
	}

	.icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.feature-card h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #111827;
	}

	.feature-card p {
		color: #6b7280;
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.cta {
		color: #667eea;
		font-weight: 600;
		margin-top: auto;
	}
</style>
