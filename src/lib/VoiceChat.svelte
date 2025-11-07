<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import SessionsPanel from './SessionsPanel.svelte';
	import { signIn, signOut } from '@auth/sveltekit/client';
	import { sessionStore, currentSession, type ChatSession, type ChatMessage } from './stores/sessionStore';
	import { repoStore } from './stores/repoStore';

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

	// Extract repository name without org prefix
	const repoName = $derived(repository ? repository.split('/').pop() || repository : '');

	let ws: WebSocket | null = null;
	let audioContext: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let isConnected = $state(false);
	let isRecording = $state(false);
	let isSpeaking = $state(false);
	let isVoiceMode = $state(false); // Track if voice mode is active
	let isConnecting = $state(false); // Track connecting state
	let error = $state('');
	let isLoadingRepo = $state(false);
	let repoLoadStatus = $state('');
	// Transcript now comes from session store, but we keep local state for reactivity
	let transcript = $state<Array<{ role: string; text: string }>>([]);
	let audioWorklet: AudioWorkletNode | null = null;
	let audioQueue: Array<ArrayBuffer> = [];
	let isPlayingAudio = false;
	let nextPlaybackTime = 0;
	let currentResponseId: string | null = null;
	let processingResponse = false;
	let currentAudioSource: AudioBufferSourceNode | null = null;
	let shouldCancelAudio = false;
	let textMessage = $state('');
	let textInputRef = $state<HTMLTextAreaElement>();
	let audioProcessor: ScriptProcessorNode | null = null;
	let messagesContainerRef = $state<HTMLDivElement>();
	let connectedRepository = $state(''); // Track which repository we're connected to
	let isIntentionalDisconnect = false; // Track if disconnect is intentional (e.g., switching repos)
	let sidebarCollapsed = $state(false); // Track sidebar collapsed state

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

	// Reconnect when repository changes
	$effect(() => {
		console.log('Repository effect triggered:', { repository, connectedRepository });
		// Only reconnect if repository actually changed
		if (repository !== connectedRepository) {
			if (repository) {
				// Repository was selected or changed, create/load session and connect
				console.log('Repository changed, connecting to:', repository);
				
				// Get or create session for this repository
				const sessionId = sessionStore.getOrCreateSessionForRepo(repository);
				
				// Load session messages into local transcript
				const currentSessionData = sessionStore.getCurrentSession();
				if (currentSessionData) {
					// Convert ChatMessage[] to transcript format
					transcript = currentSessionData.messages.map(msg => ({
						role: msg.role,
						text: msg.text
					}));
				}
				
				connectWebSocket();
			} else {
				// Repository was cleared, disconnect
				console.log('Repository cleared, disconnecting');
				if (ws) {
					isIntentionalDisconnect = true; // Mark as intentional
					ws.close();
					ws = null;
					isConnected = false;
				}
				connectedRepository = '';
				transcript = [];
			}
		}
	});

	// Sync transcript to current session whenever it changes
	$effect(() => {
		if (transcript.length > 0 && $currentSession) {
			// This effect runs when transcript changes
			// We need to be careful not to create infinite loops
			const sessionMessages = $currentSession.messages;
			
			// Only sync if transcript is different from session
			// (to avoid circular updates)
			const transcriptChanged = 
				transcript.length !== sessionMessages.length ||
				transcript.some((msg, idx) => 
					!sessionMessages[idx] || 
					msg.text !== sessionMessages[idx].text ||
					msg.role !== sessionMessages[idx].role
				);

			// This is handled by addTranscript and updateTranscript functions
			// which directly call sessionStore methods
		}
	});

	// Auto-connect on mount only if repository is selected
	onMount(() => {
		// Connection will be handled by the $effect above
		// Just setup cleanup handlers
	});

	async function connectWebSocket() {
		// Close existing connection if any
		if (ws) {
			isIntentionalDisconnect = true; // Mark as intentional before closing
			ws.close();
			ws = null;
		}

		if (!repository) {
			// Don't connect if no repository is selected
			connectedRepository = '';
			return;
		}

		try {
			error = ''; // Clear any previous errors
			isIntentionalDisconnect = false; // Reset flag for new connection

			// Connect to WebSocket with repository parameter
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/api/voice?repo=${encodeURIComponent(repository)}`;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				isConnected = true;
				connectedRepository = repository; // Mark which repository we're connected to
				console.log('Connected to AI chat for repository:', repository);
				// Disable server VAD by default (enable only when voice chat starts)
				setTimeout(() => disableServerVAD(), 500);
			};

			ws.onmessage = async (event) => {
				const data = JSON.parse(event.data);
				console.log('WebSocket message:', data.type, data);

				// Handle different event types from OpenAI and custom server messages
				switch (data.type) {
					case 'repo.loading':
						// Handle repository loading status
						if (data.status === 'started') {
							isLoadingRepo = true;
							repoLoadStatus = `Loading ${data.repository}...`;
						} else if (data.status === 'completed') {
							isLoadingRepo = false;
							repoLoadStatus = `Loaded ${data.fileCount} files (${data.totalSize}KB)`;
							// Clear status after 3 seconds
							setTimeout(() => {
								repoLoadStatus = '';
							}, 3000);
						} else if (data.status === 'error') {
							isLoadingRepo = false;
							repoLoadStatus = '';
							error = `Failed to load repository: ${data.error}`;
						}
						break;

					case 'github.issue_created':
						// Handle issue creation notification
						console.log('GitHub issue created:', data.issue);
						// Add a system message to transcript
						addTranscript('system', `✅ Created issue #${data.issue.number}: ${data.issue.title}`);
						break;

					case 'session.created':
						console.log('Session created:', data);
						break;

					case 'session.updated':
						console.log('Session updated:', data);
						break;

					case 'input_audio_buffer.speech_started':
						console.log('Speech started - user is speaking');
						// Cancel any ongoing response when user starts speaking in voice mode
						if (isVoiceMode) {
							// Always cancel audio playback when user starts speaking
							cancelCurrentAudio();

							// If there's an ongoing response, cancel it too
							if (processingResponse && ws) {
								console.log('Canceling ongoing response for user interruption');
								ws.send(JSON.stringify({ type: 'response.cancel' }));
								processingResponse = false;
								currentResponseId = null;
							}
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
						// Add user message when conversation item is created (before response starts)
						if (data.item?.role === 'user') {
							const content = data.item?.content?.[0];
							// Only add transcript for audio input in voice mode
							// Text messages are already added in sendTextMessage()
							if (content?.type === 'input_audio' && isVoiceMode) {
								// Add placeholder for voice input
								addTranscript('user', '...');
							}
						}
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
						if (
							data.response_id === currentResponseId &&
							data.delta &&
							audioContext &&
							isVoiceMode
						) {
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
						// User's speech transcription - update the placeholder we added earlier
						if (data.transcript) {
							// Find the last user message with placeholder and update it
							let lastUserIndex = -1;
							for (let i = transcript.length - 1; i >= 0; i--) {
								if (transcript[i].role === 'user' && transcript[i].text === '...') {
									lastUserIndex = i;
									break;
								}
							}

							if (lastUserIndex !== -1) {
								transcript[lastUserIndex].text = data.transcript;
								transcript = [...transcript];
								
								// Sync to session store - replace the placeholder
								sessionStore.replaceLastMessage(data.transcript);
							} else {
								// Fallback: add if not found
								addTranscript('user', data.transcript);
							}
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
				// Only show error if not an intentional disconnect or repository switch
				if (!isIntentionalDisconnect && repository === connectedRepository) {
					error = 'Connection error occurred';
				}
			};

			ws.onclose = (event) => {
				isConnected = false;
				isRecording = false;
				isVoiceMode = false;
				const wasConnectedToRepo = connectedRepository;
				connectedRepository = ''; // Clear connected repository on close
				console.log('Disconnected from AI chat');
				
				// If connection was rejected due to authentication (401)
				if (event.code === 1008 || event.reason?.includes('Authentication')) {
					error = 'Authentication required. Please sign in.';
				}
				// Only show error if not intentional, we were connected, and not switching repos
				else if (!isIntentionalDisconnect && wasConnectedToRepo && repository === wasConnectedToRepo) {
					error = 'Connection lost';
				}
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
		ws.send(
			JSON.stringify({
				type: 'session.update',
				session: {
					turn_detection: null
				}
			})
		);
	}

	function enableServerVAD() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		// Enable server-side voice activity detection for voice mode
		console.log('Enabling server VAD for voice mode');
		ws.send(
			JSON.stringify({
				type: 'session.update',
				session: {
					turn_detection: {
						type: 'server_vad',
						threshold: 0.6,
						prefix_padding_ms: 300,
						silence_duration_ms: 800
					}
				}
			})
		);
	}

	async function startVoiceChat() {
		try {
			error = '';
			isConnecting = true;

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

				// Show bounce animation after connecting
				isConnecting = false;
			}
		} catch (err) {
			console.error('Error starting voice chat:', err);
			error = err instanceof Error ? err.message : 'Failed to start voice chat';
			isConnecting = false;
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
		// Set flag to cancel audio playback loop
		shouldCancelAudio = true;

		// Stop currently playing audio source
		if (currentAudioSource) {
			try {
				currentAudioSource.stop();
				currentAudioSource.disconnect();
			} catch (e) {
				// Audio source may already be stopped
				console.log('Audio source already stopped');
			}
			currentAudioSource = null;
		}

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
		shouldCancelAudio = false;

		try {
			while (audioQueue.length > 0 && !shouldCancelAudio) {
				// Check cancellation before processing next chunk
				if (shouldCancelAudio) {
					console.log('Audio playback cancelled before next chunk');
					break;
				}

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

				// Store reference to current audio source
				currentAudioSource = source;

				// Calculate when to start this chunk (play immediately)
				const currentTime = audioContext.currentTime;
				const startTime = Math.max(currentTime, nextPlaybackTime);

				source.start(startTime);

				// Update next playback time to be after this chunk finishes
				nextPlaybackTime = startTime + audioBuffer.duration;

				// Wait for the chunk to finish with cancellation support
				await new Promise<void>((resolve) => {
					let resolved = false;

					source.onended = () => {
						if (!resolved) {
							resolved = true;
							currentAudioSource = null;
							resolve();
						}
					};

					// Check for cancellation periodically
					const checkInterval = setInterval(() => {
						if (shouldCancelAudio && !resolved) {
							resolved = true;
							clearInterval(checkInterval);
							// Stop the source immediately
							try {
								source.stop();
								source.disconnect();
							} catch (e) {
								// May already be stopped
							}
							currentAudioSource = null;
							resolve();
						}
					}, 10); // Check every 10ms for responsive cancellation

					// Cleanup interval when audio ends naturally
					source.addEventListener('ended', () => {
						clearInterval(checkInterval);
					});
				});

				// Check again after the chunk
				if (shouldCancelAudio) {
					console.log('Audio playback cancelled after chunk');
					break;
				}
			}
		} finally {
			isPlayingAudio = false;
			isSpeaking = false;
			currentAudioSource = null;
			console.log('Audio queue processing ended');
		}
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
		
		// Sync to session store
		const message: ChatMessage = {
			role: role as 'user' | 'assistant' | 'system',
			text,
			timestamp: Date.now()
		};
		sessionStore.addMessage(message);
	}

	function updateTranscript(role: string, text: string) {
		if (transcript.length > 0 && transcript[transcript.length - 1].role === role) {
			transcript[transcript.length - 1].text += text;
			transcript = [...transcript];
			
			// Sync to session store - update last message
			sessionStore.updateLastMessage(text);
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
			await new Promise((resolve) => setTimeout(resolve, 500));
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
			await new Promise((resolve) => setTimeout(resolve, 300));
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
		isConnecting = false;

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

	// Session handlers
	function handleNewSession() {
		if (!repository) {
			// Can't create session without repository
			error = 'Please select a repository first';
			return;
		}

		// Create a new session for current repository
		sessionStore.createSession(repository);
		
		// Clear transcript to start fresh
		transcript = [];
		
		// Clear any existing conversation state
		if (ws && ws.readyState === WebSocket.OPEN) {
			// Could send a clear conversation command if needed
			console.log('Started new session for:', repository);
		}
	}

	function handleSessionSelect(session: ChatSession) {
		// Switch to the selected session
		sessionStore.switchSession(session.id);
		
		// Load messages from the session
		transcript = session.messages.map(msg => ({
			role: msg.role,
			text: msg.text
		}));
		
		// If session is for different repo, switch to that repo
		if (session.repository !== repository) {
			console.log('Switching to repository:', session.repository);
			// Update the repo store to trigger repository change
			repoStore.set(session.repository);
		}
	}

	onDestroy(() => {
		disconnect();
	});
</script>

<div class="grok-container">
	<!-- Left Sidebar - Chat History -->
	{#if session?.user}
		<SessionsPanel
			onSessionSelect={handleSessionSelect}
			onNewSession={handleNewSession}
			bind:isCollapsed={sidebarCollapsed}
			{session}
		/>
	{/if}
	
	<!-- Main Content Area -->
	<div class="main-content">
		<!-- Top Navigation Bar -->
		<nav class="top-nav">
			<div class="nav-left">
				{#if session?.user}
					{#if repository}
						<button onclick={changeRepo} class="repo-badge connected" title="Connected to {repository}\nClick to change repository">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
							</svg>
							<span class="repo-full-name">{repository}</span>
							{#if isConnected}
								<span class="connection-indicator" title="Connected to AI"></span>
							{/if}
						</button>
					{:else}
						<button onclick={changeRepo} class="repo-badge select-repo" title="Select a repository to start">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
							</svg>
							<span>Select Repository</span>
						</button>
					{/if}
				{/if}
			</div>

			<div class="nav-right">
				{#if isLoadingRepo}
					<div class="status-pill loading">
						<span class="spinner"></span>
						<span>{repoLoadStatus}</span>
					</div>
				{:else if repoLoadStatus}
					<div class="status-pill success">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
						<span>{repoLoadStatus}</span>
					</div>
				{/if}
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
		</div>
	</nav>

	<!-- Main Chat Area -->
	<div class="chat-area">
		<div class="messages-container" bind:this={messagesContainerRef}>
			{#if !repository}
				<div class="welcome-state">
					<div class="welcome-icon">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
						</svg>
					</div>
					<h2>Select a Repository</h2>
					<p>Choose a GitHub repository from the selector above to start chatting with Apollo</p>
				</div>
			{:else if transcript.length === 0}
				<div class="welcome-state">
					<div class="welcome-icon">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
						</svg>
					</div>
					<h2>Connected to {repository}</h2>
					<p class="welcome-description">I can help you with:</p>
					<div class="capabilities-list">
						<div class="capability-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<path d="M12 16v-4"></path>
								<path d="M12 8h.01"></path>
							</svg>
							<span>Creating and managing GitHub issues</span>
						</div>
						<div class="capability-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="11" cy="11" r="8"></circle>
								<path d="m21 21-4.35-4.35"></path>
							</svg>
							<span>Searching through your codebase</span>
						</div>
						<div class="capability-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
							</svg>
							<span>Getting repository information and stats</span>
						</div>
						<div class="capability-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
							</svg>
							<span>Adding comments to issues</span>
						</div>
					</div>
					<p class="welcome-tip">Type a message or start a voice conversation to get started!</p>
				</div>
			{:else}
				<div class="messages-list">
					{#each transcript as message, index}
						<div class="message-wrapper {message.role}">
							<div class="message-bubble">
								<div class="message-content">
									<MarkdownRenderer content={message.text} />
								</div>
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
					<line x1="12" y1="8" x2="12" y2="12"></line>
					<line x1="12" y1="16" x2="12.01" y2="16"></line>
				</svg>
				{error}
			</div>
		{/if}

		<div class="input-wrapper">
			<div class="input-controls">
				<textarea
					bind:this={textInputRef}
					bind:value={textMessage}
					onkeydown={handleKeyDown}
					placeholder={repository ? "Message Apollo..." : "Select a repository to start chatting"}
					rows="1"
					class="message-input"
					disabled={!repository}
				></textarea>

				<button
					class="send-btn"
					onclick={sendTextMessage}
					disabled={!textMessage.trim() || !repository}
					title="Send message"
				>
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
						<line x1="22" y1="2" x2="11" y2="13"></line>
						<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
					</svg>
				</button>

				<button
					class="voice-btn"
					class:connecting={isConnecting}
					class:recording={isVoiceMode && isRecording}
					class:speaking={isSpeaking}
					class:active={isVoiceMode}
					onclick={isVoiceMode ? stopVoiceChat : startVoiceChat}
					disabled={!repository}
					title={!repository ? 'Select a repository to use voice chat' : (isVoiceMode ? 'Stop voice chat' : 'Start voice chat')}
				>
					<div class="waveform-icon">
						{#if isVoiceMode}
							<!-- Stop icon when active -->
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<rect width="8" height="8" x="6" y="6" rx="1.5"></rect>
							</svg>
						{:else}
							<!-- Custom 5-bar waveform icon -->
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
								<rect
									class="bar bar-1"
									x="3"
									y="8"
									width="2.5"
									height="8"
									rx="1.25"
									fill="currentColor"
								></rect>
								<rect
									class="bar bar-2"
									x="7.5"
									y="5"
									width="2.5"
									height="14"
									rx="1.25"
									fill="currentColor"
								></rect>
								<rect
									class="bar bar-3"
									x="12"
									y="3"
									width="2.5"
									height="18"
									rx="1.25"
									fill="currentColor"
								></rect>
								<rect
									class="bar bar-4"
									x="16.5"
									y="5"
									width="2.5"
									height="14"
									rx="1.25"
									fill="currentColor"
								></rect>
								<rect
									class="bar bar-5"
									x="21"
									y="8"
									width="2.5"
									height="8"
									rx="1.25"
									fill="currentColor"
								></rect>
							</svg>
						{/if}
					</div>
					{#if isVoiceMode && isRecording}
						<div class="pulse-ring"></div>
					{/if}
				</button>
			</div>
		</div>
	</div>
	</div>
</div>

<style>
	.grok-container {
		display: flex;
		flex-direction: row;
		height: 100vh;
		/* Use dynamic viewport height on mobile to account for browser UI */
		height: 100dvh;
		width: 100%;
		background: #0a0a0a;
		color: #e5e5e5;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
	}
	
	/* Main Content Area - takes rest of space */
	.main-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0; /* Allow flexbox to shrink */
	}

	/* Top Navigation */
	.top-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #111111;
		height: 60px;
		flex-shrink: 0;
		/* Add safe area for notches */
		padding-left: max(1rem, env(safe-area-inset-left));
		padding-right: max(1rem, env(safe-area-inset-right));
		padding-top: max(0.75rem, env(safe-area-inset-top));
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 1rem;
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
		position: relative;
	}

	.repo-badge.connected {
		border-color: rgba(16, 185, 129, 0.3);
		background: rgba(16, 185, 129, 0.05);
	}

	.repo-badge .repo-full-name {
		color: #e5e5e5;
		font-weight: 500;
	}

	.connection-indicator {
		width: 8px;
		height: 8px;
		background: #10b981;
		border-radius: 50%;
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% {
			opacity: 1;
			box-shadow: 0 0 4px rgba(16, 185, 129, 0.6);
		}
		50% {
			opacity: 0.6;
			box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
		}
	}

	.repo-badge:hover {
		background: #222222;
		border-color: #444444;
		color: #e5e5e5;
	}

	.repo-badge.connected:hover {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.4);
	}

	.repo-badge.select-repo {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-color: transparent;
		color: #ffffff;
	}

	.repo-badge.select-repo:hover {
		opacity: 0.9;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

	.status-pill.loading {
		color: #f59e0b;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.status-pill.success {
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.3);
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(245, 158, 11, 0.3);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.user-menu-container {
		position: relative;
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
		cursor: pointer;
		transition: all 0.2s;
		color: #e5e5e5;
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

	.welcome-description {
		font-weight: 600;
		color: #e5e5e5;
		margin-top: 1rem !important;
	}

	.capabilities-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
		text-align: left;
		max-width: 400px;
		width: 100%;
	}

	.capability-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: #1a1a1a;
		border: 1px solid #333333;
		border-radius: 0.5rem;
		color: #e5e5e5;
		transition: all 0.2s;
	}

	.capability-item:hover {
		background: #222222;
		border-color: #444444;
	}

	.capability-item svg {
		flex-shrink: 0;
		color: #667eea;
	}

	.welcome-tip {
		margin-top: 1.5rem !important;
		font-size: 0.875rem !important;
		font-style: italic;
	}

	.new-chat-mini-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 0.375rem;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.new-chat-mini-btn:hover {
		opacity: 0.9;
		transform: scale(1.05);
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

	.message-wrapper.system {
		justify-content: center;
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

	.message-wrapper.system .message-bubble {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
		color: #86efac;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		padding: 0.75rem 1rem;
		max-width: 50%;
	}

	.message-content {
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
		padding: 1rem;
		background: #0a0a0a;
		/* Add safe area for mobile home indicator */
		padding-bottom: max(1rem, env(safe-area-inset-bottom));
		padding-left: max(1rem, env(safe-area-inset-left));
		padding-right: max(1rem, env(safe-area-inset-right));
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
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.75rem 0.75rem 1.25rem;
		background: #111111;
		border: 1px solid #333333;
		border-radius: 2rem;
		transition: all 0.2s;
	}

	.message-input {
		flex: 1;
		background: transparent;
		border: none !important;
		color: #e5e5e5;
		font-size: 0.9375rem;
		line-height: 1.5;
		resize: none;
		max-height: 200px;
		min-height: 24px;
		font-family: inherit;
		padding: 0.5rem 0;
		box-shadow: none !important;
	}

	.message-input:focus {
		outline: none !important;
		border: none !important;
		box-shadow: none !important;
	}

	.message-input::placeholder {
		color: #666666;
	}

	/* Send Button Styles */
	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: #667eea;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		background: rgba(102, 126, 234, 0.1);
		transform: scale(1.05);
	}

	.send-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.send-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Voice Button Styles */
	.voice-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		flex-shrink: 0;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
	}

	.voice-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	.voice-btn:active {
		transform: scale(0.95);
	}

	.voice-btn.active {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		animation: pulse-scale 2s ease-in-out infinite;
	}

	.voice-btn.active:hover {
		box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);
	}

	.voice-btn.recording {
		animation: pulse-scale 1.5s ease-in-out infinite;
	}

	.voice-btn.speaking {
		animation: speaking-pulse 0.8s ease-in-out infinite;
	}

	.voice-btn.connecting {
		animation: none;
	}

	.waveform-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		position: relative;
	}

	/* Waveform bar animations */
	.waveform-icon .bar {
		transform-origin: center;
		transition: all 0.3s ease;
	}

	/* Connecting state - sequential wave animation */
	.voice-btn.connecting .bar {
		animation: wave-connecting 1.2s ease-in-out infinite;
	}

	.voice-btn.connecting .bar-1 {
		animation-delay: 0s;
	}

	.voice-btn.connecting .bar-2 {
		animation-delay: 0.1s;
	}

	.voice-btn.connecting .bar-3 {
		animation-delay: 0.2s;
	}

	.voice-btn.connecting .bar-4 {
		animation-delay: 0.3s;
	}

	.voice-btn.connecting .bar-5 {
		animation-delay: 0.4s;
	}

	/* Active state - all bars animate together */
	.voice-btn.active:not(.connecting) .bar {
		animation: wave-active 1s ease-in-out infinite;
	}

	.voice-btn.active:not(.connecting) .bar-1,
	.voice-btn.active:not(.connecting) .bar-5 {
		animation-delay: 0s;
	}

	.voice-btn.active:not(.connecting) .bar-2,
	.voice-btn.active:not(.connecting) .bar-4 {
		animation-delay: 0.1s;
	}

	.voice-btn.active:not(.connecting) .bar-3 {
		animation-delay: 0.2s;
	}

	/* Recording state - more energetic animation */
	.voice-btn.recording .bar {
		animation: wave-recording 0.6s ease-in-out infinite;
	}

	.voice-btn.recording .bar-1 {
		animation-delay: 0s;
	}

	.voice-btn.recording .bar-2 {
		animation-delay: 0.05s;
	}

	.voice-btn.recording .bar-3 {
		animation-delay: 0.1s;
	}

	.voice-btn.recording .bar-4 {
		animation-delay: 0.15s;
	}

	.voice-btn.recording .bar-5 {
		animation-delay: 0.2s;
	}

	/* Speaking state - reactive animation */
	.voice-btn.speaking .bar {
		animation: wave-speaking 0.4s ease-in-out infinite;
	}

	.voice-btn.speaking .bar-1,
	.voice-btn.speaking .bar-5 {
		animation-delay: 0s;
	}

	.voice-btn.speaking .bar-2,
	.voice-btn.speaking .bar-4 {
		animation-delay: 0.1s;
	}

	.voice-btn.speaking .bar-3 {
		animation-delay: 0.05s;
	}

	/* Bounce effect when connection completes */
	.voice-btn.active:not(.connecting) {
		animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	/* Pulse ring animation for recording state */
	.pulse-ring {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.8);
		animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse-scale {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.08);
		}
	}

	@keyframes speaking-pulse {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
		}
		50% {
			transform: scale(1.12);
			box-shadow: 0 4px 20px rgba(239, 68, 68, 0.6);
		}
	}

	@keyframes pulse-ring {
		0% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
		100% {
			transform: translate(-50%, -50%) scale(1.8);
			opacity: 0;
		}
	}

	/* Waveform bar animations */
	@keyframes wave-connecting {
		0%,
		100% {
			transform: scaleY(1);
			opacity: 0.6;
		}
		50% {
			transform: scaleY(0.4);
			opacity: 1;
		}
	}

	@keyframes wave-active {
		0%,
		100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(0.6);
		}
	}

	@keyframes wave-recording {
		0%,
		100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(0.5);
		}
	}

	@keyframes wave-speaking {
		0%,
		100% {
			transform: scaleY(1);
		}
		25% {
			transform: scaleY(0.4);
		}
		75% {
			transform: scaleY(1.2);
		}
	}

	@keyframes bounce-in {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
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
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: currentColor;
		animation: wave-animation 1s infinite;
	}

	@keyframes wave-animation {
		0%,
		100% {
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

	/* Mobile-First Responsive Design */
	@media (max-width: 768px) {
		/* Adjust navigation for mobile */
		.top-nav {
			padding: 0.5rem 0.75rem;
			height: auto;
			min-height: 50px;
		}

		.repo-badge {
			padding: 0.375rem 0.5rem;
			font-size: 0.8125rem;
		}

		.repo-badge span {
			max-width: 120px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.nav-left {
			gap: 0.5rem;
		}

		.nav-right {
			gap: 0.5rem;
		}

		/* Reduce status pill sizes */
		.status-pill {
			padding: 0.375rem 0.625rem;
			font-size: 0.8125rem;
		}

		/* Optimize messages for mobile */
		.messages-list {
			padding: 1rem 0.75rem;
			gap: 1rem;
		}

		.message-bubble {
			max-width: 85%;
			font-size: 0.875rem;
			padding: 0.875rem 1rem;
		}

		.message-wrapper.system .message-bubble {
			max-width: 70%;
			font-size: 0.8125rem;
		}

		/* Optimize welcome state */
		.welcome-state {
			padding: 1.5rem 1rem;
		}

		.welcome-state h2 {
			font-size: 1.5rem;
		}

		.welcome-state p {
			font-size: 0.9375rem;
		}

		.welcome-icon {
			width: 64px;
			height: 64px;
		}

		.welcome-icon svg {
			width: 48px;
			height: 48px;
		}

		/* Optimize input area for mobile */
		.input-area {
			padding: 0.75rem;
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
		}

		.input-controls {
			padding: 0.625rem 0.625rem 0.625rem 1rem;
		}

		.message-input {
			font-size: 0.875rem;
		}

		.voice-btn {
			width: 44px;
			height: 44px;
		}

		.send-btn {
			width: 36px;
			height: 36px;
		}
	}

	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		/* Improve touch targets */
		.voice-btn,
		.send-btn,
		.repo-badge,
		.user-pill {
			min-height: 44px; /* iOS minimum touch target */
			min-width: 44px;
		}

		/* Smooth scrolling on touch devices */
		.messages-container {
			-webkit-overflow-scrolling: touch;
			overscroll-behavior: contain;
		}

		/* Prevent text selection during interactions */
		.voice-btn,
		.send-btn {
			-webkit-tap-highlight-color: transparent;
			-webkit-touch-callout: none;
			user-select: none;
		}
	}

	/* Small mobile devices */
	@media (max-width: 375px) {
		.nav-right {
			gap: 0.5rem;
		}

		.repo-badge span {
			max-width: 80px;
		}

		.status-pill span {
			font-size: 0.75rem;
		}

		.send-btn {
			width: 32px;
			height: 32px;
		}

		.send-btn svg {
			width: 18px;
			height: 18px;
		}

		.voice-btn {
			width: 40px;
			height: 40px;
		}

		.voice-btn svg {
			width: 20px;
			height: 20px;
		}

		/* Adjust error banner */
		.error-banner {
			padding: 0.625rem 0.875rem;
			font-size: 0.8125rem;
			margin-bottom: 0.75rem;
		}

		/* User dropdown positioning */
		.user-dropdown {
			right: -0.5rem;
		}
	}

	/* Extra small devices */
	@media (max-width: 480px) {
		.repo-badge span {
			max-width: 120px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.status-pill {
			font-size: 0.75rem;
			padding: 0.25rem 0.5rem;
		}

		.status-pill span {
			display: none;
		}

		.message-bubble {
			max-width: 90%;
			padding: 0.75rem 0.875rem;
		}
	}
</style>
