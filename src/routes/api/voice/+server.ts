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
	updateGitHubIssue,
	getRepositoryTree
} from '$lib/github-helpers';
import { openAIRealtimeUrl, relayCloseCode, voiceSessionConfig } from '$lib/server/voiceProtocol';

const GITHUB_ASSISTANT_SYSTEM_PROMPT = `You are Apollo, a GitHub assistant with direct access to repository tools.

{{REPO_CONTEXT}}

You have these tools available - use them when needed:
- get_repository_summary
- list_issues
- create_issue  
- search_code
- add_issue_comment
- update_issue
- get_repository_tree

When users ask you to do something, call the appropriate tool immediately. Don't ask for permission or describe what you would do - just execute the tool.

Examples:
- "list issues" → call list_issues()
- "search for auth" → call search_code(query="auth")
- "create issue..." → call create_issue(title="...", body="...")

{{ASSISTANT_INSTRUCTIONS}}

{{LEGACY_CONTEXT}}`;

async function setupOpenAIConnection(
	clientWs: any,
	OPENAI_API_KEY: string,
	repository?: string,
	accessToken?: string
) {
	// Connect to OpenAI Realtime API
	const openaiWs = new WebSocket(openAIRealtimeUrl(), [
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
		// Early return if client has disconnected - don't process messages for closed connections
		if (clientWs.readyState !== WebSocket.OPEN) {
			console.log('Client disconnected, skipping message processing');
			return;
		}

		const message = JSON.parse(event.data);

		// Log all message types for debugging (except audio data)
		if (message.type && !message.type.includes('audio')) {
			console.log('OpenAI message type:', message.type);
			// Log more details for responses
			if (message.type.includes('response')) {
				console.log('Response details:', JSON.stringify(message, null, 2).substring(0, 500));
			}
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

			console.log('Tool call executing:', functionName, 'with args:', args);

			// Check if client is still connected before executing potentially slow tool calls
			if (clientWs.readyState !== WebSocket.OPEN) {
				console.log('Client disconnected, skipping tool execution');
				return;
			}

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

					case 'update_issue':
						const updates: any = {};
						if (args.title) updates.title = args.title;
						if (args.body) updates.body = args.body;
						if (args.state) updates.state = args.state;
						if (args.labels) updates.labels = args.labels;
						result = await updateGitHubIssue(accessToken, owner, repo, args.issue_number, updates);
						break;

					case 'get_repository_tree':
						result = await getRepositoryTree(accessToken, owner, repo, args.branch);
						break;

					default:
						throw new Error(`Unknown function: ${functionName}`);
				}

				// Check if client disconnected during tool execution
				if (clientWs.readyState !== WebSocket.OPEN) {
					console.log('Client disconnected during tool execution, not sending result');
					return;
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
			const [owner, repo] = repository.split('/');
			repoContext = `Connected to repository: ${repository} (owner: ${owner}, repo: ${repo})\n`;
			repoContext += `All tools are configured for this repository. Just call them.\n\n`;
		} else {
			repoContext = 'No repository selected.\n\n';
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
			},
			{
				type: 'function',
				name: 'update_issue',
				description: 'Update an existing GitHub issue (title, body, state, or labels)',
				parameters: {
					type: 'object',
					properties: {
						issue_number: {
							type: 'number',
							description: 'Issue number to update'
						},
						title: {
							type: 'string',
							description: 'New issue title (optional)'
						},
						body: {
							type: 'string',
							description: 'New issue body/description in markdown format (optional)'
						},
						state: {
							type: 'string',
							enum: ['open', 'closed'],
							description: 'New issue state (optional)'
						},
						labels: {
							type: 'array',
							items: { type: 'string' },
							description: 'New labels for the issue (optional)'
						}
					},
					required: ['issue_number']
				}
			},
			{
				type: 'function',
				name: 'get_repository_tree',
				description: 'Get the file tree structure of the repository to see all files and folders',
				parameters: {
					type: 'object',
					properties: {
						branch: {
							type: 'string',
							description: 'Branch name (optional, defaults to default branch)'
						}
					}
				}
			}
		];

		// Send session configuration
		const sessionConfig = voiceSessionConfig(instructions, tools);

		console.log('Sending session config with', tools.length, 'tools for repository:', repository);
		console.log('Tool choice:', sessionConfig.session.tool_choice);
		console.log('Tools:', tools.map((t) => t.name).join(', '));
		console.log('Instructions length:', instructions.length);
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
			// Use a valid close code (1000 = normal closure, or 1001-1003 for other cases)
			// Don't use reserved codes like 1005, 1006, etc.
			const closeCode = relayCloseCode(event.code);
			clientWs.close(closeCode, event.reason || 'Connection closed');
		}
	});

	// Handle client connection close
	clientWs.addEventListener('close', (event: any) => {
		console.log('Client connection closed:', event.code, event.reason);
		if (openaiWs.readyState === WebSocket.OPEN) {
			// Use a valid close code
			const closeCode = relayCloseCode(event.code);
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
