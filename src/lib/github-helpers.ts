// GitHub API helpers for Apollo app
import { Octokit } from '@octokit/rest';
import type { RequestEvent } from '@sveltejs/kit';

export interface GitHubIssue {
	number: number;
	title: string;
	body: string | null;
	state: string;
	created_at: string;
	updated_at: string;
	html_url: string;
	user: {
		login: string;
		avatar_url: string;
	} | null;
	labels: Array<{ name: string; color: string }>;
}

export interface RepoSummary {
	name: string;
	full_name: string;
	description: string | null;
	language: string | null;
	stars: number;
	forks: number;
	open_issues: number;
	default_branch: string;
	topics: string[];
	created_at: string;
	updated_at: string;
	homepage: string | null;
	html_url: string;
	readme?: string;
}

export interface CodeSearchResult {
	path: string;
	repository: string;
	matches: Array<{
		line: number;
		content: string;
	}>;
}

/**
 * Create a GitHub issue
 */
export async function createGitHubIssue(
	accessToken: string,
	owner: string,
	repo: string,
	title: string,
	body: string,
	labels?: string[]
): Promise<GitHubIssue> {
	const octokit = new Octokit({ auth: accessToken });

	const issue = await octokit.issues.create({
		owner,
		repo,
		title,
		body,
		labels
	});

	return issue.data as GitHubIssue;
}

/**
 * List issues for a repository
 */
export async function listGitHubIssues(
	accessToken: string,
	owner: string,
	repo: string,
	state: 'open' | 'closed' | 'all' = 'open',
	limit: number = 30
): Promise<GitHubIssue[]> {
	const octokit = new Octokit({ auth: accessToken });

	const { data } = await octokit.issues.listForRepo({
		owner,
		repo,
		state,
		per_page: limit
	});

	return data as GitHubIssue[];
}

/**
 * Get detailed repository information
 */
export async function getRepositorySummary(
	accessToken: string,
	owner: string,
	repo: string
): Promise<RepoSummary> {
	const octokit = new Octokit({ auth: accessToken });

	// Get repo info
	const { data: repoData } = await octokit.repos.get({
		owner,
		repo
	});

	// Try to get README
	let readmeContent = '';
	try {
		const { data: readmeData } = await octokit.repos.getReadme({
			owner,
			repo
		});
		if ('content' in readmeData) {
			readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
		}
	} catch (error) {
		console.log('No README found or error fetching README');
	}

	return {
		name: repoData.name,
		full_name: repoData.full_name,
		description: repoData.description,
		language: repoData.language,
		stars: repoData.stargazers_count,
		forks: repoData.forks_count,
		open_issues: repoData.open_issues_count,
		default_branch: repoData.default_branch,
		topics: repoData.topics || [],
		created_at: repoData.created_at,
		updated_at: repoData.updated_at,
		homepage: repoData.homepage,
		html_url: repoData.html_url,
		readme: readmeContent
	};
}

/**
 * Search for code in a repository
 */
export async function searchRepositoryCode(
	accessToken: string,
	owner: string,
	repo: string,
	query: string,
	limit: number = 10
): Promise<CodeSearchResult[]> {
	const octokit = new Octokit({ auth: accessToken });

	const { data } = await octokit.search.code({
		q: `${query} repo:${owner}/${repo}`,
		per_page: limit
	});

	return data.items.map((item) => ({
		path: item.path,
		repository: item.repository.full_name,
		matches: [] // GitHub API doesn't return line matches directly
	}));
}

/**
 * Get repository file tree structure
 */
export async function getRepositoryTree(
	accessToken: string,
	owner: string,
	repo: string,
	branch?: string
): Promise<Array<{ path: string; type: string; size?: number }>> {
	const octokit = new Octokit({ auth: accessToken });

	// Get default branch if not specified
	if (!branch) {
		const { data: repoData } = await octokit.repos.get({ owner, repo });
		branch = repoData.default_branch;
	}

	const { data: treeData } = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: branch,
		recursive: 'true'
	});

	return treeData.tree.map((item) => ({
		path: item.path || '',
		type: item.type || '',
		size: item.size
	}));
}

/**
 * Update an existing issue
 */
export async function updateGitHubIssue(
	accessToken: string,
	owner: string,
	repo: string,
	issueNumber: number,
	updates: {
		title?: string;
		body?: string;
		state?: 'open' | 'closed';
		labels?: string[];
	}
): Promise<GitHubIssue> {
	const octokit = new Octokit({ auth: accessToken });

	const { data } = await octokit.issues.update({
		owner,
		repo,
		issue_number: issueNumber,
		...updates
	});

	return data as GitHubIssue;
}

/**
 * Add a comment to an issue
 */
export async function addIssueComment(
	accessToken: string,
	owner: string,
	repo: string,
	issueNumber: number,
	comment: string
): Promise<void> {
	const octokit = new Octokit({ auth: accessToken });

	await octokit.issues.createComment({
		owner,
		repo,
		issue_number: issueNumber,
		body: comment
	});
}

// Example usage in a +page.server.ts:
/*
import type { Actions } from './$types';
import { createGitHubIssue } from './github-helpers';

export const actions = {
  createIssue: async (event) => {
    const formData = await event.request.formData();
    const title = formData.get('title') as string;
    const body = formData.get('body') as string;
  	
    try {
      const issue = await createGitHubIssue(
        event,
        'your-repo',
        'your-username',
        title,
        body
      );
    	
      return {
        success: true,
        issue
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
} satisfies Actions;
*/
