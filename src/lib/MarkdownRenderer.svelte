<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { onMount } from 'svelte';

	let { content = '' }: { content: string } = $props();
	let renderedHTML = $state('');

	// Configure marked for better rendering
	marked.setOptions({
		breaks: true, // Enable line breaks
		gfm: true, // GitHub Flavored Markdown
	});

	// Update rendered HTML whenever content changes
	$effect(() => {
		if (content) {
			// Parse markdown and sanitize HTML
			const parsed = marked.parse(content) as string;
			renderedHTML = DOMPurify.sanitize(parsed, {
				ALLOWED_TAGS: [
					'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
					'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
					'ul', 'ol', 'li',
					'blockquote',
					'a', 'img',
					'table', 'thead', 'tbody', 'tr', 'th', 'td',
					'span', 'div'
				],
				ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'title']
			});
		}
	});
</script>

<div class="markdown-content">
	{@html renderedHTML}
</div>

<style>
	.markdown-content {
		width: 100%;
		line-height: 1.6;
	}

	.markdown-content :global(p) {
		margin: 0.5em 0;
	}

	.markdown-content :global(p:first-child) {
		margin-top: 0;
	}

	.markdown-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(code) {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.2em 0.4em;
		border-radius: 3px;
		font-size: 0.9em;
		font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	}

	.markdown-content :global(pre) {
		background: rgba(255, 255, 255, 0.05);
		padding: 1em;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.75em 0;
	}

	.markdown-content :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.875em;
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3),
	.markdown-content :global(h4),
	.markdown-content :global(h5),
	.markdown-content :global(h6) {
		margin: 1em 0 0.5em 0;
		font-weight: 600;
		line-height: 1.3;
	}

	.markdown-content :global(h1) { font-size: 1.75em; }
	.markdown-content :global(h2) { font-size: 1.5em; }
	.markdown-content :global(h3) { font-size: 1.25em; }
	.markdown-content :global(h4) { font-size: 1.1em; }

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
	}

	.markdown-content :global(li) {
		margin: 0.25em 0;
	}

	.markdown-content :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.3);
		padding-left: 1em;
		margin: 0.5em 0;
		color: rgba(255, 255, 255, 0.7);
		font-style: italic;
	}

	.markdown-content :global(a) {
		color: #667eea;
		text-decoration: none;
		transition: color 0.2s;
	}

	.markdown-content :global(a:hover) {
		color: #764ba2;
		text-decoration: underline;
	}

	.markdown-content :global(strong) {
		font-weight: 600;
	}

	.markdown-content :global(em) {
		font-style: italic;
	}

	.markdown-content :global(table) {
		border-collapse: collapse;
		margin: 0.75em 0;
		width: 100%;
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5em;
		text-align: left;
	}

	.markdown-content :global(th) {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 600;
	}

	.markdown-content :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 6px;
		margin: 0.5em 0;
	}
</style>
