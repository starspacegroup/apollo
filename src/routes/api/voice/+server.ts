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

CRITICAL INSTRUCTIONS:
- You have DIRECT ACCESS to GitHub API tools and MUST use them when users request actions
- When a user asks you to perform an action (create issue, search code, list issues, etc.), YOU MUST CALL THE APPROPRIATE TOOL IMMEDIATELY
- Do NOT just describe what you could do - ACTUALLY USE THE TOOLS
- After calling a tool and getting results, present them to the user in a helpful, conversational way
- The repository context is ALREADY SET - you are working with a specific repository and have full permissions to act on it
- Tools available: get_repository_summary, list_issues, create_issue, search_code, add_issue_comment, update_issue`;

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

		// Log all message types for debugging (except audio data)
		if (message.type && !message.type.includes('audio')) {
			console.log('OpenAI message type:', message.type);
		}

		// Handle function/tool calls - check for the correct event type from OpenAI Realtime API
		// The event is response.output_item.added when a function call is added
		// Then response.output_item.done when it's complete
		if (message.type === 'response.output_item.added' && message.item?.type === 'function_call') {
			console.log('Function call item added:', message.item);
		}

		if (message.type === 'response.output_item.done' && message.item?.type === 'function_call') {
			const functionName = message.item.name;
			const args = JSON.parse(message.item.arguments || '{}');
			const callId = message.item.call_id;

			console.log('Tool call executing:', functionName, args);

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
						call_id: callId,
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
						call_id: callId,
						output: JSON.stringify({
							error: error instanceof Error ? error.message : 'Unknown error'
						})
					}
				};
				openaiWs.send(JSON.stringify(errorOutput));
				// Trigger response even on error
				openaiWs.send(JSON.stringify({ type: 'response.create' }));
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
			repoContext = `You are currently working with the GitHub repository: **${repository}**\n\n`;
			repoContext += `IMPORTANT: You have access to GitHub API tools and can perform the following actions on the ${repository} repository:\n`;
			repoContext += `- Get repository summary and information\n`;
			repoContext += `- List, create, update, and comment on issues\n`;
			repoContext += `- Search through the codebase\n\n`;
			repoContext += `When users ask you to perform these actions, you should USE THE TOOLS AVAILABLE TO YOU to execute them directly. Don't just explain what could be done - actually do it!\n\n`;
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

		console.log('Sending session config with', tools.length, 'tools for repository:', repository);
		console.log('Instructions include:', instructions.substring(0, 200) + '...');
		openaiWs.send(JSON.stringify(sessionConfig));

		// Send initial context message about the repository
		if (repository) {
			setTimeout(() => {
				const contextMessage = {
					type: 'conversation.item.create',
					item: {
						type: 'message',
						role: 'user',
						content: [
							{
								type: 'input_text',
								text: `I'm working on the ${repository} repository. Please introduce yourself and let me know what you can help me with.`
							}
						]
					}
				};
				openaiWs.send(JSON.stringify(contextMessage));

				// Trigger a response to the context message
				openaiWs.send(JSON.stringify({ type: 'response.create' }));
			}, 500);
		}
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
			// Use a valid close code (1000 = normal closure, or 1001-1003 for other cases)
			// Don't use reserved codes like 1005, 1006, etc.
			const closeCode = event.code >= 1000 && event.code <= 1003 ? event.code : 1000;
			clientWs.close(closeCode, event.reason || 'Connection closed');
		}
	});

	// Handle client connection close
	clientWs.addEventListener('close', (event: any) => {
		console.log('Client connection closed:', event.code, event.reason);
		if (openaiWs.readyState === WebSocket.OPEN) {
			// Use a valid close code
			const closeCode = event.code >= 1000 && event.code <= 1003 ? event.code : 1000;
			openaiWs.close(closeCode, event.reason || 'Connection closed');
		}
	});
}

export const GET: RequestHandler = async ({ request, platform, url, locals }) => {
	const upgradeHeader = request.headers.get('Upgrade');

	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return new Response('Expected Upgrade: websocket', { status: 426 });
	}

	// Check authentication first
	const session = await locals.auth();
	if (!session?.accessToken) {
		return new Response('Authentication required', { status: 401 });
	}

	// Get OpenAI API key from environment
	const OPENAI_API_KEY = platform?.env?.OPENAI_API_KEY;

	if (!OPENAI_API_KEY) {
		return new Response('OpenAI API key not configured', { status: 500 });
	}

	// Extract repository from query params
	const repository = url.searchParams.get('repo') || undefined;

	// Get access token from session
	const accessToken = session.accessToken;

	// Cloudflare Workers environment
	const webSocketPair = new WebSocketPair();
	const [client, server] = Object.values(webSocketPair);
	server.accept();

	// Only setup OpenAI connection if repository is selected
	if (repository) {
		console.log('Client connected to voice WebSocket for repository:', repository);
		setupOpenAIConnection(server, OPENAI_API_KEY, repository, accessToken);
	} else {
		// Send error message immediately since WebSocket is already accepted
		setTimeout(() => {
			if (server.readyState === WebSocket.OPEN) {
				server.send(
					JSON.stringify({
						type: 'error',
						error: { message: 'Please select a repository to start chatting' }
					})
				);
			}
		}, 0);

		// Listen for messages from client but don't forward anywhere
		server.addEventListener('message', (event: any) => {
			// Client trying to send messages without a repository selected
			if (server.readyState === WebSocket.OPEN) {
				server.send(
					JSON.stringify({
						type: 'error',
						error: { message: 'Please select a repository to start chatting' }
					})
				);
			}
		});
	}

	return new Response(null, {
		status: 101,
		webSocket: client
	});
};
