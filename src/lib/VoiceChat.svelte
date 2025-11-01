<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let ws: WebSocket | null = null;
	let audioContext: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let isConnected = $state(false);
	let isRecording = $state(false);
	let isSpeaking = $state(false);
	let error = $state('');
	let transcript = $state<Array<{ role: string; text: string }>>([]);
	let audioWorklet: AudioWorkletNode | null = null;
	let audioQueue: Array<ArrayBuffer> = [];
	let isPlayingAudio = false;
	let nextPlaybackTime = 0;
	let currentResponseId: string | null = null;
	let processingResponse = false;

	async function startVoiceChat() {
		try {
			error = '';

			// Request microphone access
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

			// Create audio context
			audioContext = new AudioContext({ sampleRate: 24000 });

			// Connect to WebSocket
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/api/voice`;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				isConnected = true;
				console.log('Connected to voice chat');
				startRecording();
			};

			ws.onmessage = async (event) => {
				const data = JSON.parse(event.data);
				console.log('WebSocket message:', data.type, data);

				// Handle different event types from OpenAI
				switch (data.type) {
					case 'session.created':
						console.log('Session created:', data);
						break;

					case 'session.updated':
						console.log('Session updated:', data);
						break;

					case 'input_audio_buffer.speech_started':
						console.log('Speech started - user is speaking');
						// Cancel any ongoing response when user starts speaking
						if (processingResponse && ws) {
							ws.send(JSON.stringify({ type: 'response.cancel' }));
							cancelCurrentAudio();
						}
						break;

					case 'input_audio_buffer.speech_stopped':
						console.log('Speech stopped - committing audio buffer');
						// Explicitly commit the audio buffer and request response
						if (ws) {
							ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
							ws.send(JSON.stringify({ type: 'response.create' }));
						}
						break;

					case 'conversation.item.created':
						console.log('Item created:', data);
						break;

					case 'response.created':
						// New response started
						currentResponseId = data.response?.id || null;
						processingResponse = true;
						console.log('Response created:', currentResponseId);
						break;

					case 'response.audio.delta':
						// Play audio response only if it matches current response
						if (data.response_id === currentResponseId && data.delta && audioContext) {
							await playAudio(data.delta);
						}
						break;

					case 'response.audio_transcript.delta':
						// Update transcript with AI response
						if (data.response_id === currentResponseId && data.delta) {
							updateTranscript('assistant', data.delta);
						}
						break;

					case 'conversation.item.input_audio_transcription.completed':
						// User's speech transcription
						if (data.transcript) {
							addTranscript('user', data.transcript);
						}
						break;

					case 'response.done':
						// Response completely finished
						console.log('Response done:', data.response?.id);
						processingResponse = false;
						currentResponseId = null;
						break;

					case 'response.audio.done':
						// Audio stream is complete, let the queue finish naturally
						console.log('Audio done for response:', data.response_id);
						break;

					case 'error':
						console.error('OpenAI error:', data);
						error = data.error?.message || 'An error occurred';
						processingResponse = false;
						break;
				}
			};

			ws.onerror = (event) => {
				console.error('WebSocket error:', event);
				error = 'Connection error occurred';
			};

			ws.onclose = () => {
				isConnected = false;
				isRecording = false;
				console.log('Disconnected from voice chat');
			};
		} catch (err) {
			console.error('Error starting voice chat:', err);
			error = err instanceof Error ? err.message : 'Failed to start voice chat';
		}
	}

	async function startRecording() {
		if (!audioContext || !mediaStream || !ws) return;

		try {
			const source = audioContext.createMediaStreamSource(mediaStream);

			// Create ScriptProcessor for audio capture
			const processor = audioContext.createScriptProcessor(4096, 1, 1);

			processor.onaudioprocess = (e) => {
				if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;

				// Don't send audio if we're processing a response (AI is speaking)
				if (processingResponse) return;

				const inputData = e.inputBuffer.getChannelData(0);

				// Convert Float32Array to Int16Array (PCM16)
				const pcm16 = new Int16Array(inputData.length);
				for (let i = 0; i < inputData.length; i++) {
					const s = Math.max(-1, Math.min(1, inputData[i]));
					pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
				}

				// Send audio to OpenAI
				const audioEvent = {
					type: 'input_audio_buffer.append',
					audio: base64Encode(pcm16.buffer)
				};

				ws.send(JSON.stringify(audioEvent));
			};

			source.connect(processor);
			processor.connect(audioContext.destination);

			isRecording = true;
		} catch (err) {
			console.error('Error starting recording:', err);
			error = 'Failed to start recording';
		}
	}

	function cancelCurrentAudio() {
		// Clear the audio queue and stop playback
		audioQueue = [];
		isPlayingAudio = false;
		isSpeaking = false;
		nextPlaybackTime = audioContext?.currentTime || 0;
		console.log('Cancelled current audio playback');
	}

	async function playAudio(base64Audio: string) {
		if (!audioContext) return;

		try {
			isSpeaking = true;
			const audioData = base64Decode(base64Audio);
			audioQueue.push(audioData);
			
			if (!isPlayingAudio) {
				processAudioQueue();
			}
		} catch (err) {
			console.error('Error playing audio:', err);
		}
	}

	async function processAudioQueue() {
		if (!audioContext || isPlayingAudio || audioQueue.length === 0) return;

		isPlayingAudio = true;

		while (audioQueue.length > 0) {
			const audioData = audioQueue.shift()!;
			const pcm16 = new Int16Array(audioData);

			// Convert PCM16 to Float32
			const float32 = new Float32Array(pcm16.length);
			for (let i = 0; i < pcm16.length; i++) {
				float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
			}

			const audioBuffer = audioContext.createBuffer(1, float32.length, audioContext.sampleRate);
			audioBuffer.getChannelData(0).set(float32);

			const source = audioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(audioContext.destination);

			// Calculate when to start this chunk
			const currentTime = audioContext.currentTime;
			const startTime = Math.max(currentTime, nextPlaybackTime);
			
			source.start(startTime);
			
			// Update next playback time to be after this chunk finishes
			nextPlaybackTime = startTime + audioBuffer.duration;

			// Wait for the chunk to finish before processing the next one
			await new Promise<void>((resolve) => {
				source.onended = () => resolve();
			});
		}

		isPlayingAudio = false;
		isSpeaking = false;
	}

	function base64Encode(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	function base64Decode(base64: string): ArrayBuffer {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	function addTranscript(role: string, text: string) {
		transcript = [...transcript, { role, text }];
	}

	function updateTranscript(role: string, text: string) {
		if (transcript.length > 0 && transcript[transcript.length - 1].role === role) {
			transcript[transcript.length - 1].text += text;
			transcript = [...transcript];
		} else {
			addTranscript(role, text);
		}
	}

	function stopVoiceChat() {
		if (ws) {
			ws.close();
			ws = null;
		}

		if (mediaStream) {
			mediaStream.getTracks().forEach((track) => track.stop());
			mediaStream = null;
		}

		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}

		// Clear audio queue
		audioQueue = [];
		isPlayingAudio = false;
		nextPlaybackTime = 0;
		currentResponseId = null;
		processingResponse = false;

		isConnected = false;
		isRecording = false;
		isSpeaking = false;
	}

	onDestroy(() => {
		stopVoiceChat();
	});
</script>

<div class="voice-chat-container">
	<div class="header">
		<h2>AI Voice Chat</h2>
		<div class="status">
			{#if isConnected}
				<span class="status-indicator connected"></span>
				<span>Connected</span>
			{:else}
				<span class="status-indicator disconnected"></span>
				<span>Disconnected</span>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="error-message">
			{error}
		</div>
	{/if}

	<div class="transcript-container">
		{#if transcript.length === 0}
			<div class="empty-state">
				<p>Start the voice chat to begin conversation</p>
			</div>
		{:else}
			{#each transcript as message}
				<div class="message {message.role}">
					<div class="message-role">{message.role === 'user' ? 'You' : 'AI'}</div>
					<div class="message-text">{message.text}</div>
				</div>
			{/each}
		{/if}
	</div>

	<div class="controls">
		{#if !isConnected}
			<button class="btn btn-primary" onclick={startVoiceChat}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
					<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
					<line x1="12" x2="12" y1="19" y2="22"></line>
				</svg>
				Start Voice Chat
			</button>
		{:else}
			<button class="btn btn-danger" onclick={stopVoiceChat}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect width="6" height="6" x="9" y="9"></rect>
				</svg>
				Stop
			</button>
		{/if}

		{#if isRecording}
			<div class="recording-indicator">
				<span class="pulse"></span>
				<span>Listening...</span>
			</div>
		{/if}

		{#if isSpeaking}
			<div class="speaking-indicator">
				<span class="wave"></span>
				<span>AI Speaking...</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.voice-chat-container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		height: calc(100vh - 4rem);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 1rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.header h2 {
		margin: 0;
		font-size: 1.875rem;
		font-weight: 700;
		color: #111827;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status-indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.status-indicator.connected {
		background-color: #10b981;
		animation: pulse-green 2s infinite;
	}

	.status-indicator.disconnected {
		background-color: #6b7280;
	}

	@keyframes pulse-green {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.error-message {
		padding: 1rem;
		background-color: #fee2e2;
		border: 1px solid #ef4444;
		border-radius: 0.5rem;
		color: #991b1b;
		font-size: 0.875rem;
	}

	.transcript-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #6b7280;
		font-size: 1rem;
	}

	.message {
		padding: 1rem;
		border-radius: 0.5rem;
		animation: slideIn 0.3s ease-out;
	}

	.message.user {
		background-color: #dbeafe;
		margin-left: 2rem;
	}

	.message.assistant {
		background-color: #ffffff;
		margin-right: 2rem;
		border: 1px solid #e5e7eb;
	}

	.message-role {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.message-text {
		color: #111827;
		line-height: 1.5;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background-color: #ffffff;
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
	}

	.btn-primary {
		background-color: #3b82f6;
		color: white;
	}

	.btn-primary:hover {
		background-color: #2563eb;
	}

	.btn-danger {
		background-color: #ef4444;
		color: white;
	}

	.btn-danger:hover {
		background-color: #dc2626;
	}

	.recording-indicator,
	.speaking-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
	}

	.pulse {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: #ef4444;
		animation: pulse-red 1.5s infinite;
	}

	@keyframes pulse-red {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
	}

	.wave {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: #3b82f6;
		animation: wave 1s infinite;
	}

	@keyframes wave {
		0%,
		100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(1.5);
		}
	}
</style>
