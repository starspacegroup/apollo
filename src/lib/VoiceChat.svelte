<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Accept repository as a prop
	let { 
		repository = '', 
		session = null,
		changeRepo = () => {}
	}: { 
		repository?: string; 
		session?: any;
		changeRepo?: () => void;
	} = $props();

	let ws: WebSocket | null = null;
	let audioContext: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let isConnected = $state(false);
	let isRecording = $state(false);
	let isSpeaking = $state(false);
	let isVoiceMode = $state(false); // Track if voice mode is active
	let error = $state('');
	let transcript = $state<Array<{ role: string; text: string }>>([]);
	let audioWorklet: AudioWorkletNode | null = null;
	let audioQueue: Array<ArrayBuffer> = [];
	let isPlayingAudio = false;
	let nextPlaybackTime = 0;
	let currentResponseId: string | null = null;
	let processingResponse = false;
	let textMessage = $state('');
	let textInputRef = $state<HTMLTextAreaElement>();
	let audioProcessor: ScriptProcessorNode | null = null;
	let messagesContainerRef = $state<HTMLDivElement>();

	// Auto-scroll to bottom when transcript changes
	$effect(() => {
		if (transcript.length > 0 && messagesContainerRef) {
			setTimeout(() => {
				if (messagesContainerRef) {
					messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
				}
			}, 50);
		}
	});

	// Auto-connect on mount
	onMount(() => {
		connectWebSocket();
	});

	async function connectWebSocket() {
		if (ws && ws.readyState === WebSocket.OPEN) {
			return; // Already connected
		}

		try {
			error = '';

			// Connect to WebSocket with repository parameter
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/api/voice${repository ? `?repo=${encodeURIComponent(repository)}` : ''}`;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				isConnected = true;
				console.log('Connected to AI chat');
				// Disable server VAD by default (enable only when voice chat starts)
				setTimeout(() => disableServerVAD(), 500);
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
						// Cancel any ongoing response when user starts speaking in voice mode
						if (processingResponse && ws && isVoiceMode) {
							console.log('Canceling ongoing response for user interruption');
							ws.send(JSON.stringify({ type: 'response.cancel' }));
							cancelCurrentAudio();
							processingResponse = false;
							currentResponseId = null;
						}
						break;

					case 'input_audio_buffer.speech_stopped':
						console.log('Speech stopped - server VAD will handle response automatically');
						// With server_vad enabled, OpenAI automatically creates response
						// No need to manually commit or create response
						break;

					case 'input_audio_buffer.committed':
						console.log('Audio buffer committed');
						// With server_vad, this is handled automatically
						break;

					case 'conversation.item.created':
						console.log('Item created:', data);
						break;

					case 'response.created':
						// New response started
						if (processingResponse && currentResponseId) {
							console.warn('Response created while another is in progress!', {
								existing: currentResponseId,
								new: data.response?.id
							});
						}
						currentResponseId = data.response?.id || null;
						processingResponse = true;
						console.log('Response created:', currentResponseId);
						break;

					case 'response.output_item.added':
						// Output item added
						console.log('Output item added:', data);
						break;

					case 'response.content_part.added':
						// Content part added
						console.log('Content part added:', data);
						break;

					case 'response.audio.delta':
						// Play audio response only if it matches current response and we're in voice mode
						if (data.response_id === currentResponseId && data.delta && audioContext && isVoiceMode) {
							await playAudio(data.delta);
						}
						break;

					case 'response.audio_transcript.delta':
						// Update transcript with AI response (audio transcription)
						if (data.response_id === currentResponseId && data.delta) {
							updateTranscript('assistant', data.delta);
						}
						break;

					case 'response.text.delta':
						// Update transcript with AI response (text)
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

					case 'response.cancelled':
						// Response was cancelled
						console.log('Response cancelled:', data.response?.id);
						processingResponse = false;
						currentResponseId = null;
						cancelCurrentAudio();
						break;

					case 'response.audio.done':
						// Audio stream is complete, let the queue finish naturally
						console.log('Audio done for response:', data.response_id);
						break;

					case 'error':
						console.error('OpenAI error:', data);
						error = data.error?.message || 'An error occurred';
						processingResponse = false;
						currentResponseId = null;
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
				isVoiceMode = false;
				console.log('Disconnected from AI chat');
			};
		} catch (err) {
			console.error('Error connecting:', err);
			error = err instanceof Error ? err.message : 'Failed to connect';
		}
	}

	function disableServerVAD() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		
		// Disable server-side voice activity detection for text mode
		console.log('Disabling server VAD for text mode');
		ws.send(JSON.stringify({
			type: 'session.update',
			session: {
				turn_detection: null
			}
		}));
	}

	function enableServerVAD() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		
		// Enable server-side voice activity detection for voice mode
		console.log('Enabling server VAD for voice mode');
		ws.send(JSON.stringify({
			type: 'session.update',
			session: {
				turn_detection: {
					type: 'server_vad',
					threshold: 0.6,
					prefix_padding_ms: 300,
					silence_duration_ms: 800
				}
			}
		}));
	}

	async function startVoiceChat() {
		try {
			error = '';

			// Connect WebSocket if not already connected
			await connectWebSocket();

			// Request microphone access
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

			// Create audio context
			audioContext = new AudioContext({ sampleRate: 24000 });

			// Wait for connection to be ready
			if (ws && ws.readyState === WebSocket.OPEN) {
				isVoiceMode = true;
				enableServerVAD();
				startRecording();
			}
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
			audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

			audioProcessor.onaudioprocess = (e) => {
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

			source.connect(audioProcessor);
			audioProcessor.connect(audioContext.destination);

			isRecording = true;
		} catch (err) {
			console.error('Error starting recording:', err);
			error = 'Failed to start recording';
		}
	}

	function stopRecording() {
		if (audioProcessor) {
			audioProcessor.disconnect();
			audioProcessor = null;
		}

		if (mediaStream) {
			mediaStream.getTracks().forEach((track) => track.stop());
			mediaStream = null;
		}

		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}

		isRecording = false;
		isVoiceMode = false;
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

	async function sendTextMessage() {
		if (!textMessage.trim()) return;

		const message = textMessage.trim();
		textMessage = '';

		// Connect WebSocket if not already connected
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			await connectWebSocket();
			// Wait a bit for connection to establish
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		if (!ws || ws.readyState !== WebSocket.OPEN) {
			error = 'Failed to connect. Please try again.';
			return;
		}

		// Add user message to transcript immediately
		addTranscript('user', message);

		// Cancel any ongoing response
		if (processingResponse) {
			console.log('Canceling response before sending text message');
			ws.send(JSON.stringify({ type: 'response.cancel' }));
			cancelCurrentAudio();
			processingResponse = false;
			currentResponseId = null;
			// Wait longer for cancellation to be acknowledged
			await new Promise(resolve => setTimeout(resolve, 300));
		}

		// Check again to ensure no response is in progress
		if (processingResponse) {
			console.warn('Response still in progress after cancellation attempt');
			error = 'Please wait for the current response to finish';
			return;
		}

		// Send text message as a conversation item
		const textEvent = {
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: message
					}
				]
			}
		};

		ws.send(JSON.stringify(textEvent));
		
		// Request response from AI (explicit for text messages)
		console.log('Requesting AI response for text message');
		ws.send(JSON.stringify({ type: 'response.create' }));
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendTextMessage();
		}
	}

	function stopVoiceChat() {
		// Only stop recording, not the WebSocket connection
		stopRecording();

		// Clear audio queue
		audioQueue = [];
		isPlayingAudio = false;
		nextPlaybackTime = 0;
		isSpeaking = false;

		// Disable server VAD for text chat mode
		disableServerVAD();

		// Keep WebSocket connection for text chat
	}

	function disconnect() {
		// Fully disconnect everything
		stopRecording();

		if (ws) {
			ws.close();
			ws = null;
		}

		// Clear audio queue
		audioQueue = [];
		isPlayingAudio = false;
		nextPlaybackTime = 0;
		currentResponseId = null;
		processingResponse = false;

		isConnected = false;
		isSpeaking = false;
	}

	onDestroy(() => {
		disconnect();
	});
</script>

<div class="grok-container">
	<!-- Top Navigation Bar -->
	<nav class="top-nav">
		<div class="nav-left">
			<h1 class="logo">Apollo</h1>
			{#if repository}
				<button onclick={changeRepo} class="repo-badge" title="Change repository">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
					</svg>
					<span>{repository}</span>
				</button>
			{/if}
		</div>
		
		<div class="nav-right">
			{#if isRecording}
				<div class="status-pill recording">
					<span class="pulse"></span>
					<span>Listening</span>
				</div>
			{/if}
			{#if isSpeaking}
				<div class="status-pill speaking">
					<span class="wave"></span>
					<span>Speaking</span>
				</div>
			{/if}
			{#if session?.user}
				<div class="user-pill">
					{#if session.user.image}
						<img src={session.user.image} alt={session.user.name || 'User'} class="user-avatar" />
					{/if}
					<span>{session.user.name || session.user.username}</span>
				</div>
			{/if}
		</div>
	</nav>

	<!-- Main Chat Area -->
	<div class="chat-area">
		<div class="messages-container" bind:this={messagesContainerRef}>
			{#if transcript.length === 0}
				<div class="welcome-state">
					<div class="welcome-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
						</svg>
					</div>
					<h2>How can I help you today?</h2>
					<p>Ask me anything about your GitHub repository or start a voice conversation</p>
				</div>
			{:else}
				<div class="messages-list">
					{#each transcript as message, index}
						<div class="message-wrapper {message.role}">
							<div class="message-bubble">
								<div class="message-content">{message.text}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom Input Area -->
	<div class="input-area">
		{#if error}
			<div class="error-banner">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="12" y1="8" x2="12" y2="12"></line>
					<line x1="12" y1="16" x2="12.01" y2="16"></line>
				</svg>
				{error}
			</div>
		{/if}
		
		<div class="input-wrapper">
			<div class="input-controls">
				<button 
					class="icon-btn voice-btn" 
					class:active={isVoiceMode}
					onclick={isVoiceMode ? stopVoiceChat : startVoiceChat}
					title={isVoiceMode ? 'Stop voice chat' : 'Start voice chat'}
				>
					{#if isVoiceMode}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<rect width="6" height="6" x="9" y="9" rx="1"></rect>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
							<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
							<line x1="12" x2="12" y1="19" y2="22"></line>
						</svg>
					{/if}
				</button>
				
				<textarea
					bind:this={textInputRef}
					bind:value={textMessage}
					onkeydown={handleKeyDown}
					placeholder="Message Apollo..."
					rows="1"
					class="message-input"
				></textarea>
				
				<button 
					class="icon-btn send-btn" 
					onclick={sendTextMessage}
					disabled={!textMessage.trim()}
					title="Send message"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 2L11 13"></path>
						<path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.grok-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		background: #0a0a0a;
		color: #e5e5e5;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
	}

	/* Top Navigation */
	.top-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1.5rem;
		background: #111111;
		border-bottom: 1px solid #222222;
		height: 60px;
		flex-shrink: 0;
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 1rem;
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

	.repo-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: #1a1a1a;
		border: 1px solid #333333;
		border-radius: 0.5rem;
		color: #a0a0a0;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.repo-badge:hover {
		background: #222222;
		border-color: #444444;
		color: #e5e5e5;
	}

	.nav-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.875rem;
		background: #1a1a1a;
		border-radius: 1rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status-pill.recording {
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.status-pill.speaking {
		color: #3b82f6;
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.user-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem 0.375rem 0.375rem;
		background: #1a1a1a;
		border: 1px solid #333333;
		border-radius: 1rem;
		font-size: 0.875rem;
	}

	.user-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
	}

	/* Chat Area */
	.chat-area {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.welcome-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem;
		text-align: center;
	}

	.welcome-icon {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.welcome-icon svg {
		stroke: white;
	}

	.welcome-state h2 {
		font-size: 2rem;
		font-weight: 600;
		margin: 0;
		color: #ffffff;
	}

	.welcome-state p {
		font-size: 1rem;
		color: #a0a0a0;
		margin: 0;
		max-width: 500px;
	}

	.messages-list {
		display: flex;
		flex-direction: column;
		padding: 2rem 1rem;
		gap: 1.5rem;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}

	.message-wrapper {
		display: flex;
		animation: slideIn 0.3s ease-out;
	}

	.message-wrapper.user {
		justify-content: flex-end;
	}

	.message-wrapper.assistant {
		justify-content: flex-start;
	}

	.message-bubble {
		max-width: 75%;
		padding: 1rem 1.25rem;
		border-radius: 1.25rem;
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	.message-wrapper.user .message-bubble {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-bottom-right-radius: 0.375rem;
	}

	.message-wrapper.assistant .message-bubble {
		background: #1a1a1a;
		border: 1px solid #222222;
		color: #e5e5e5;
		border-bottom-left-radius: 0.375rem;
	}

	.message-content {
		white-space: pre-wrap;
		word-wrap: break-word;
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

	/* Input Area */
	.input-area {
		flex-shrink: 0;
		padding: 1.5rem;
		background: #0a0a0a;
		border-top: 1px solid #222222;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.5rem;
		color: #ef4444;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.input-wrapper {
		max-width: 900px;
		margin: 0 auto;
	}

	.input-controls {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #111111;
		border: 1px solid #333333;
		border-radius: 1.5rem;
		transition: all 0.2s;
	}

	.input-controls:focus-within {
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.message-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #e5e5e5;
		font-size: 0.9375rem;
		line-height: 1.5;
		resize: none;
		max-height: 200px;
		min-height: 24px;
		font-family: inherit;
		padding: 0.5rem;
	}

	.message-input:focus {
		outline: none;
	}

	.message-input::placeholder {
		color: #666666;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 0.75rem;
		background: transparent;
		color: #a0a0a0;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.icon-btn:hover {
		background: #1a1a1a;
		color: #e5e5e5;
	}

	.voice-btn.active {
		background: #ef4444;
		color: white;
	}

	.voice-btn.active:hover {
		background: #dc2626;
	}

	.send-btn {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.send-btn:hover:not(:disabled) {
		opacity: 0.9;
		transform: scale(1.05);
	}

	.send-btn:disabled {
		background: #1a1a1a;
		color: #666666;
		cursor: not-allowed;
		opacity: 0.5;
	}

	.send-btn:disabled:hover {
		transform: none;
	}

	/* Animations */
	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: currentColor;
		animation: pulse-animation 1.5s infinite;
	}

	@keyframes pulse-animation {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
	}

	.wave {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: currentColor;
		animation: wave-animation 1s infinite;
	}

	@keyframes wave-animation {
		0%, 100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(1.5);
		}
	}

	/* Scrollbar Styling */
	.messages-container::-webkit-scrollbar {
		width: 8px;
	}

	.messages-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.messages-container::-webkit-scrollbar-thumb {
		background: #333333;
		border-radius: 4px;
	}

	.messages-container::-webkit-scrollbar-thumb:hover {
		background: #444444;
	}
</style>
