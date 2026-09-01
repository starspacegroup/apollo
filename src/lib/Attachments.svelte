<script lang="ts" module>
	export type Attachment = {
		id: string;
		/** How it will be sent: an image part, or text folded into the message. */
		kind: 'image' | 'text';
		name: string;
		mime: string;
		size: number;
		/** `data:` URL, for an image. */
		dataUrl?: string;
		/** The contents, for a text file. */
		text?: string;
	};

	/** Anything past this is not a paste into a conversation, it is a file transfer. */
	export const MAX_BYTES = 8 * 1024 * 1024;
	/** A text file is inlined into the prompt, so it has a much smaller ceiling. */
	export const MAX_TEXT_BYTES = 256 * 1024;

	const TEXT_HINT =
		/\.(txt|md|markdown|json|jsonl|ya?ml|toml|csv|tsv|log|ts|tsx|js|jsx|svelte|rs|py|go|rb|java|c|h|cpp|sh|bash|zsh|sql|html|css|xml|ini|conf|env)$/i;

	export function isTextish(file: File): boolean {
		return (
			file.type.startsWith('text/') || TEXT_HINT.test(file.name) || file.type === 'application/json'
		);
	}

	export function humanSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	/** Read one file into the shape the composer sends. Rejections are returned, not thrown. */
	export async function readFile(file: File): Promise<Attachment | string> {
		if (file.size > MAX_BYTES) {
			return `${file.name} is ${humanSize(file.size)} — the ceiling is ${humanSize(MAX_BYTES)}`;
		}
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		if (file.type.startsWith('image/')) {
			const dataUrl = await new Promise<string>((resolve, reject) => {
				const r = new FileReader();
				r.onload = () => resolve(String(r.result));
				r.onerror = () => reject(r.error);
				r.readAsDataURL(file);
			});
			return { id, kind: 'image', name: file.name, mime: file.type, size: file.size, dataUrl };
		}
		if (isTextish(file)) {
			if (file.size > MAX_TEXT_BYTES) {
				return `${file.name} is ${humanSize(file.size)} of text — the ceiling is ${humanSize(MAX_TEXT_BYTES)}, because it is pasted into the prompt`;
			}
			const text = await file.text();
			return {
				id,
				kind: 'text',
				name: file.name,
				mime: file.type || 'text/plain',
				size: file.size,
				text
			};
		}
		return `${file.name} is ${file.type || 'a binary file'} — only images and text can be put into a conversation`;
	}
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { modelSeesImages, whyNoImages } from './realtimeModel';

	/**
	 * The composer's attachments: files a person dropped, picked or pasted, and
	 * photographs taken here.
	 *
	 * Everything stays in the page until the message is sent. Nothing is uploaded
	 * to Apollo — the parts go into the conversation item itself, the same way the
	 * typed text does, so there is no store to leak and nothing to clean up after.
	 */
	let {
		attachments = $bindable([] as Attachment[]),
		disabled = false,
		onerror = (_: string) => {}
	}: {
		attachments?: Attachment[];
		disabled?: boolean;
		onerror?: (message: string) => void;
	} = $props();

	// Whether an image can go into this conversation at all. The realtime model
	// this interface is pointed at takes text and audio only, and an image sent
	// to it is not ignored — it errors and the turn is lost. So the refusal
	// happens here, once, with the reason.
	const canSendImages = modelSeesImages();

	let fileInput = $state<HTMLInputElement | null>(null);
	let cameraOpen = $state(false);
	let cameraError = $state('');
	let video = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	let facing: 'user' | 'environment' = $state('user');

	export async function add(files: FileList | File[] | null | undefined) {
		if (!files) return;
		for (const file of Array.from(files)) {
			const got = await readFile(file);
			if (typeof got === 'string') {
				onerror(got);
			} else if (got.kind === 'image' && !canSendImages) {
				onerror(whyNoImages());
			} else {
				attachments = [...attachments, got];
			}
		}
	}

	function remove(id: string) {
		attachments = attachments.filter((a) => a.id !== id);
	}

	export function clear() {
		attachments = [];
	}

	/** Open the file picker. The palette calls this; so does the paperclip. */
	export function pick() {
		if (!disabled) fileInput?.click();
	}

	// ---- the camera ---------------------------------------------------------
	//
	// Opened only when it is asked for, and torn down on close, on unmount and on
	// a failed start. A camera left running is a light left on in someone's room.

	export async function openCamera() {
		if (disabled) return;
		if (!canSendImages) {
			// Refuse before the permission prompt, not after the photograph: asking
			// for a camera and then throwing the picture away is worse than saying
			// no first.
			onerror(whyNoImages());
			return;
		}
		cameraError = '';
		cameraOpen = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
				audio: false
			});
			if (video) {
				video.srcObject = stream;
				await video.play().catch(() => {});
			}
		} catch (e) {
			cameraError =
				e instanceof DOMException && e.name === 'NotAllowedError'
					? 'the browser refused the camera — allow it for this site and try again'
					: `could not open the camera: ${e instanceof Error ? e.message : String(e)}`;
			closeCamera();
		}
	}

	export function closeCamera() {
		cameraOpen = false;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	async function flip() {
		facing = facing === 'user' ? 'environment' : 'user';
		closeCamera();
		await openCamera();
	}

	function capture() {
		if (!video || !video.videoWidth) return;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
		attachments = [
			...attachments,
			{
				id: `${Date.now()}-shot`,
				kind: 'image',
				name: `photo-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`,
				mime: 'image/jpeg',
				// The data URL is the whole file, so its length is a fair size.
				size: Math.round((dataUrl.length * 3) / 4),
				dataUrl
			}
		];
		closeCamera();
	}

	onDestroy(closeCamera);
</script>

<svelte:window
	on:keydown={(e) => {
		if (cameraOpen && e.key === 'Escape') closeCamera();
	}}
/>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept="image/*,text/*,.md,.json,.yaml,.yml,.toml,.csv,.log,.ts,.js,.svelte,.rs,.py"
	class="hidden-input"
	onchange={(e) => {
		const t = e.currentTarget as HTMLInputElement;
		add(t.files);
		t.value = '';
	}}
/>

{#if attachments.length > 0}
	<div class="tray" aria-label="attachments">
		{#each attachments as a (a.id)}
			<div class="chip" class:image={a.kind === 'image'}>
				{#if a.kind === 'image'}
					<img src={a.dataUrl} alt={a.name} />
				{:else}
					<span class="doc">TXT</span>
				{/if}
				<span class="meta">
					<span class="name" title={a.name}>{a.name}</span>
					<span class="size">{humanSize(a.size)}</span>
				</span>
				<button class="x" onclick={() => remove(a.id)} title="remove {a.name}" aria-label="remove"
					>×</button
				>
			</div>
		{/each}
	</div>
{/if}

{#if cameraOpen}
	<div class="camera" role="dialog" aria-label="camera">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} autoplay playsinline muted></video>
		<div class="camera-row">
			<button class="ghost" onclick={closeCamera}>cancel</button>
			<button class="shutter" onclick={capture} title="take the photo" aria-label="take the photo"
			></button>
			<button class="ghost" onclick={flip}>flip</button>
		</div>
	</div>
{/if}

{#if cameraError}
	<p class="camera-error">{cameraError}</p>
{/if}

<div class="actions">
	<button class="icon" {disabled} onclick={() => fileInput?.click()} title="attach a file">
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
			/>
		</svg>
	</button>
	<button
		class="icon"
		disabled={disabled || !canSendImages}
		onclick={openCamera}
		title={canSendImages ? 'take a photo' : whyNoImages()}
	>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
			<circle cx="12" cy="13" r="4" />
		</svg>
	</button>
</div>

<style>
	.hidden-input {
		display: none;
	}

	.tray {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		max-width: 15rem;
		padding: 0.3rem 0.45rem;
		border: 1px solid rgba(127, 127, 127, 0.35);
		border-radius: 0.5rem;
		background: rgba(127, 127, 127, 0.08);
		font-size: 0.78rem;
	}

	.chip img {
		width: 2rem;
		height: 2rem;
		object-fit: cover;
		border-radius: 0.3rem;
		display: block;
	}

	.doc {
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border-radius: 0.3rem;
		background: rgba(127, 127, 127, 0.2);
		font-size: 0.6rem;
		letter-spacing: 0.04em;
	}

	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size {
		opacity: 0.6;
		font-size: 0.7rem;
	}

	.x {
		background: none;
		border: 0;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0 0.15rem;
		color: inherit;
		opacity: 0.6;
	}

	.x:hover {
		opacity: 1;
	}

	.actions {
		display: flex;
		gap: 0.2rem;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: inherit;
		opacity: 0.7;
		cursor: pointer;
	}

	.icon:hover:not(:disabled) {
		opacity: 1;
		background: rgba(127, 127, 127, 0.14);
	}

	.icon:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.camera {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: rgba(0, 0, 0, 0.86);
		backdrop-filter: blur(4px);
	}

	.camera video {
		max-width: min(90vw, 60rem);
		max-height: 70vh;
		border-radius: 0.8rem;
		background: #000;
	}

	.camera-row {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.shutter {
		width: 4rem;
		height: 4rem;
		border-radius: 50%;
		border: 4px solid rgba(255, 255, 255, 0.9);
		background: rgba(255, 255, 255, 0.2);
		cursor: pointer;
	}

	.shutter:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	.ghost {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.4);
		color: #fff;
		border-radius: 0.5rem;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
		font: inherit;
	}

	.camera-error {
		margin: 0.3rem 0;
		font-size: 0.78rem;
		color: #e06c6c;
	}
</style>
