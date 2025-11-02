import { json, error, type RequestEvent } from '@sveltejs/kit';
import {
	createGitHubIssue,
	listGitHubIssues,
	getRepositorySummary,
	searchRepositoryCode,
	getRepositoryTree,
	updateGitHubIssue,
	addIssueComment
} from '$lib/github-helpers';

export const POST = async ({ request, locals }: RequestEvent) => {
	const session = await locals.auth();

	if (!session?.accessToken) {
		throw error(401, 'Not authenticated');
	}

	try {
		const body = (await request.json()) as any;
		const { action, owner, repo, ...params } = body;

		if (!owner || !repo) {
			throw error(400, 'owner and repo are required');
		}

		const accessToken = session.accessToken;

		switch (action) {
			case 'getSummary': {
				const summary = await getRepositorySummary(accessToken, owner, repo);
				return json({ success: true, data: summary });
			}

			case 'listIssues': {
				const { state = 'open', limit = 30 } = params;
				const issues = await listGitHubIssues(accessToken, owner, repo, state, limit);
				return json({ success: true, data: issues });
			}

			case 'createIssue': {
				const { title, body: issueBody, labels } = params;
				if (!title || !issueBody) {
					throw error(400, 'title and body are required for createIssue');
				}
				const issue = await createGitHubIssue(accessToken, owner, repo, title, issueBody, labels);
				return json({ success: true, data: issue });
			}

			case 'updateIssue': {
				const { issueNumber, updates } = params;
				if (!issueNumber) {
					throw error(400, 'issueNumber is required for updateIssue');
				}
				const issue = await updateGitHubIssue(accessToken, owner, repo, issueNumber, updates);
				return json({ success: true, data: issue });
			}

			case 'addComment': {
				const { issueNumber, comment } = params;
				if (!issueNumber || !comment) {
					throw error(400, 'issueNumber and comment are required for addComment');
				}
				await addIssueComment(accessToken, owner, repo, issueNumber, comment);
				return json({ success: true });
			}

			case 'searchCode': {
				const { query, limit = 10 } = params;
				if (!query) {
					throw error(400, 'query is required for searchCode');
				}
				const results = await searchRepositoryCode(accessToken, owner, repo, query, limit);
				return json({ success: true, data: results });
			}

			case 'getTree': {
				const { branch } = params;
				const tree = await getRepositoryTree(accessToken, owner, repo, branch);
				return json({ success: true, data: tree });
			}

			default:
				throw error(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		console.error('GitHub API error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, `GitHub operation failed: ${message}`);
	}
};
