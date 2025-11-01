// Example: Using GitHub API with authenticated session
// Place this in any +page.server.ts or API route

import { Octokit } from '@octokit/rest';
import type { RequestEvent } from '@sveltejs/kit';

export async function createGitHubIssue(event: RequestEvent, repo: string, owner: string, title: string, body: string) {
  const session = await event.locals.auth();

  if (!session?.accessToken) {
    throw new Error('Not authenticated');
  }

  const octokit = new Octokit({
    auth: session.accessToken
  });

  const issue = await octokit.issues.create({
    owner,
    repo,
    title,
    body
  });

  return issue.data;
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
