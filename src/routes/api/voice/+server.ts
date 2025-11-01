import type { RequestHandler } from './$types';
// @ts-ignore - Vite raw import
import githubIssueContext from '../../../../GITHUB_ISSUE_CHATBOT.md?raw';

const GITHUB_ISSUE_INSTRUCTIONS = `You are a helpful AI assistant specialized in creating well-formed GitHub issues. You help users through a conversational interface to gather issue details and format them according to Agile best practices.

{{REPO_CONTEXT}}

Here is your complete project context and guidelines:

{{CONTEXT}}

Your role is to:
1. Help users create GitHub issues through natural conversation
2. Ask clarifying questions to gather all necessary details
3. Format issues as proper Agile user stories when appropriate
4. Follow the INVEST principles for user stories
5. Provide clear acceptance criteria and definitions of done
6. Be conversational, friendly, and guide users through the process

Respond in a conversational manner and help users create high-quality, well-structured GitHub issues.`;

function setupOpenAIConnection(clientWs: any, OPENAI_API_KEY: string, repository?: string) {
	// Connect to OpenAI Realtime API
	const url = new URL('wss://api.openai.com/v1/realtime');
	url.searchParams.set('model', 'gpt-4o-realtime-preview-2024-10-01');

	const openaiWs = new WebSocket(url.toString(), [
		'realtime',
		`openai-insecure-api-key.${OPENAI_API_KEY}`,
		'openai-beta.realtime-v1'
	]);

	// Forward messages from client to OpenAI
	clientWs.addEventListener('message', (event: any) => {
		if (openaiWs.readyState === WebSocket.OPEN) {
			openaiWs.send(event.data);
		}
	});

	// Forward messages from OpenAI to client
	openaiWs.addEventListener('message', (event: any) => {
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(event.data);
		}
	});

	// Handle OpenAI connection open
	openaiWs.addEventListener('open', () => {
		console.log('Connected to OpenAI Realtime API');

		// Build instructions with GitHub Issue Chatbot context
		const repoContext = repository
			? `You are currently working with the GitHub repository: ${repository}\n\nWhen users ask about creating issues, you should reference this repository context.\n\n`
			: 'No repository is currently selected. You can still help users plan and structure their GitHub issues.\n\n';

		const instructions = GITHUB_ISSUE_INSTRUCTIONS
			.replace('{{REPO_CONTEXT}}', repoContext)
			.replace('{{CONTEXT}}', githubIssueContext);

		// Send session configuration
		const sessionConfig = {
			type: 'session.update',
			session: {
				modalities: ['text', 'audio'],
				instructions,
				voice: 'alloy',
				input_audio_format: 'pcm16',
				output_audio_format: 'pcm16',
				input_audio_transcription: {
					model: 'whisper-1'
				},
				turn_detection: {
					type: 'server_vad',
					threshold: 0.6,
					prefix_padding_ms: 300,
					silence_duration_ms: 800
				}
			}
		};

		openaiWs.send(JSON.stringify(sessionConfig));
	});

	// Handle errors
	openaiWs.addEventListener('error', (error: any) => {
		console.error('OpenAI WebSocket error:', error);
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.close(1011, 'OpenAI connection error');
		}
	});

	// Handle OpenAI connection close
	openaiWs.addEventListener('close', (event: any) => {
		console.log('OpenAI connection closed:', event.code, event.reason);
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.close(event.code, event.reason);
		}
	});

	// Handle client connection close
	clientWs.addEventListener('close', (event: any) => {
		console.log('Client connection closed:', event.code, event.reason);
		if (openaiWs.readyState === WebSocket.OPEN) {
			openaiWs.close(event.code, event.reason);
		}
	});
}

export const GET: RequestHandler = async ({ request, platform, url }) => {
	const upgradeHeader = request.headers.get('Upgrade');

	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return new Response('Expected Upgrade: websocket', { status: 426 });
	}

	// Get OpenAI API key from environment
	const OPENAI_API_KEY = platform?.env?.OPENAI_API_KEY;

	if (!OPENAI_API_KEY) {
		return new Response('OpenAI API key not configured', { status: 500 });
	}

	// Extract repository from query params
	const repository = url.searchParams.get('repo') || undefined;

	// Cloudflare Workers environment
	const webSocketPair = new WebSocketPair();
	const [client, server] = Object.values(webSocketPair);
	server.accept();

	setupOpenAIConnection(server, OPENAI_API_KEY, repository);

	return new Response(null, {
		status: 101,
		webSocket: client
	});
};
