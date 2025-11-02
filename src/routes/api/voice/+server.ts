import type { RequestHandler } from './$types';
// @ts-ignore - Vite raw import
import githubIssueContext from '../../../../GITHUB_ISSUE_CHATBOT.md?raw';
// @ts-ignore - Vite raw import
import githubAssistantInstructions from '../../../../GITHUB_ASSISTANT_INSTRUCTIONS.md?raw';
import {
	getRepositorySummary,
	listGitHubIssues,
	createGitHubIssue,
	searchRepositoryCode,
	addIssueComment,
	updateGitHubIssue
} from '$lib/github-helpers';

const GITHUB_ASSISTANT_SYSTEM_PROMPT = `You are Apollo, an AI assistant for GitHub repository management and development.

{{REPO_CONTEXT}}

{{ASSISTANT_INSTRUCTIONS}}

{{LEGACY_CONTEXT}}

Important: When users ask you to perform GitHub operations (create issues, search code, etc.), you should naturally guide them through the process in conversation. The actual API calls will be made through the application interface based on user confirmation.`;

async function setupOpenAIConnection(
	clientWs: any,
	OPENAI_API_KEY: string,
	repository?: string,
	accessToken?: string
) {
	// Connect to OpenAI Realtime API
	const url = new URL('wss://api.openai.com/v1/realtime');
	url.searchParams.set('model', 'gpt-4o-mini-realtime-preview');

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

	// Forward messages from OpenAI to client and handle tool calls
	openaiWs.addEventListener('message', async (event: any) => {
		const message = JSON.parse(event.data);

		// Handle function/tool calls
		if (message.type === 'response.function_call_arguments.done') {
			const functionName = message.name;
			const args = JSON.parse(message.arguments || '{}');

			console.log('Tool call:', functionName, args);

			try {
				let result: any = null;

				if (!repository || !accessToken) {
					throw new Error('Repository not selected or user not authenticated');
				}

				const [owner, repo] = repository.split('/');

				switch (functionName) {
					case 'get_repository_summary':
						result = await getRepositorySummary(accessToken, owner, repo);
						break;

					case 'list_issues':
						result = await listGitHubIssues(
							accessToken,
							owner,
							repo,
							args.state || 'open',
							args.limit || 30
						);
						break;

					case 'create_issue':
						result = await createGitHubIssue(
							accessToken,
							owner,
							repo,
							args.title,
							args.body,
							args.labels
						);
						// Notify client that issue was created
						if (clientWs.readyState === WebSocket.OPEN) {
							clientWs.send(
								JSON.stringify({
									type: 'github.issue_created',
									issue: result
								})
							);
						}
						break;

					case 'search_code':
						result = await searchRepositoryCode(
							accessToken,
							owner,
							repo,
							args.query,
							args.limit || 10
						);
						break;

					case 'add_issue_comment':
						await addIssueComment(accessToken, owner, repo, args.issue_number, args.comment);
						result = { success: true, message: 'Comment added successfully' };
						break;

					default:
						throw new Error(`Unknown function: ${functionName}`);
				}

				// Send function result back to OpenAI
				const functionOutput = {
					type: 'conversation.item.create',
					item: {
						type: 'function_call_output',
						call_id: message.call_id,
						output: JSON.stringify(result)
					}
				};

				openaiWs.send(JSON.stringify(functionOutput));

				// Trigger response generation
				openaiWs.send(JSON.stringify({ type: 'response.create' }));
			} catch (error) {
				console.error('Tool call error:', error);
				const errorOutput = {
					type: 'conversation.item.create',
					item: {
						type: 'function_call_output',
						call_id: message.call_id,
						output: JSON.stringify({
							error: error instanceof Error ? error.message : 'Unknown error'
						})
					}
				};
				openaiWs.send(JSON.stringify(errorOutput));
			}
		}

		// Forward all messages to client
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(event.data);
		}
	});

	// Handle OpenAI connection open
	openaiWs.addEventListener('open', async () => {
		console.log('Connected to OpenAI Realtime API');

		// Set repository context if repository is provided (without downloading contents)
		let repoContext = '';
		if (repository) {
			repoContext = `You are currently working with the GitHub repository: ${repository}\n\n`;
			repoContext +=
				'You can help users plan and structure their GitHub issues, search code, and manage the repository.\n\n';
		} else {
			repoContext =
				'No repository is currently selected. You can still help users plan and structure their GitHub issues.\n\n';
		}

		const instructions = GITHUB_ASSISTANT_SYSTEM_PROMPT.replace('{{REPO_CONTEXT}}', repoContext)
			.replace('{{ASSISTANT_INSTRUCTIONS}}', githubAssistantInstructions)
			.replace('{{LEGACY_CONTEXT}}', githubIssueContext);

		// Define GitHub tools available to the AI
		const tools = [
			{
				type: 'function',
				name: 'get_repository_summary',
				description:
					'Get comprehensive information about the current GitHub repository including stats, README, and metadata',
				parameters: {
					type: 'object',
					properties: {},
					required: []
				}
			},
			{
				type: 'function',
				name: 'list_issues',
				description: 'List GitHub issues from the current repository',
				parameters: {
					type: 'object',
					properties: {
						state: {
							type: 'string',
							enum: ['open', 'closed', 'all'],
							description: 'Filter issues by state'
						},
						limit: {
							type: 'number',
							description: 'Maximum number of issues to return (default: 30)'
						}
					}
				}
			},
			{
				type: 'function',
				name: 'create_issue',
				description: 'Create a new GitHub issue in the current repository',
				parameters: {
					type: 'object',
					properties: {
						title: {
							type: 'string',
							description: 'Issue title'
						},
						body: {
							type: 'string',
							description: 'Issue description/body in markdown format'
						},
						labels: {
							type: 'array',
							items: { type: 'string' },
							description: 'Labels to apply to the issue'
						}
					},
					required: ['title', 'body']
				}
			},
			{
				type: 'function',
				name: 'search_code',
				description: 'Search for code in the current repository',
				parameters: {
					type: 'object',
					properties: {
						query: {
							type: 'string',
							description: 'Search query'
						},
						limit: {
							type: 'number',
							description: 'Maximum number of results (default: 10)'
						}
					},
					required: ['query']
				}
			},
			{
				type: 'function',
				name: 'add_issue_comment',
				description: 'Add a comment to an existing GitHub issue',
				parameters: {
					type: 'object',
					properties: {
						issue_number: {
							type: 'number',
							description: 'Issue number to comment on'
						},
						comment: {
							type: 'string',
							description: 'Comment text in markdown format'
						}
					},
					required: ['issue_number', 'comment']
				}
			}
		];

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
				},
				tools
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

export const GET: RequestHandler = async ({ request, platform, url, locals }) => {
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

	// Get access token from session
	const session = await locals.auth();
	const accessToken = session?.accessToken;

	// Cloudflare Workers environment
	const webSocketPair = new WebSocketPair();
	const [client, server] = Object.values(webSocketPair);
	server.accept();

	setupOpenAIConnection(server, OPENAI_API_KEY, repository, accessToken);

	return new Response(null, {
		status: 101,
		webSocket: client
	});
};
