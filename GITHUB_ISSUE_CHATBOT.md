# GitHub Issue Chatbot - Project Context

## Overview

A conversational AI assistant that helps create well-formed GitHub issues for
the specified repository. The chatbot guides users through issue creation and
optionally formats them as proper Agile user stories following best practices.

## Core Functionality

### Primary Features

- **Interactive Issue Creation**: Conversational interface to gather issue
  details
- **GitHub Integration**: Direct creation of issues in the repository via GitHub
  API
- **User Story Formatting**: Optional Agile user story structure with acceptance
  criteria
- **Smart Defaults**: Infers context from conversation and repository state

### User Story Format (Agile Best Practices)

When creating user stories, follow this structure:

```
**As a** [type of user]
**I want** [goal/desire]
**So that** [benefit/value]

### Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

### Additional Details
[Optional: technical notes, dependencies, constraints]

### Definition of Done
- [ ] Code implemented and reviewed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Acceptance criteria validated
```

## Technical Architecture

### Tech Stack

- **Framework**: SvelteKit (existing project)
- **Language**: TypeScript
- **API Integration**: GitHub REST API / Octokit
- **AI/Chat**: [To be determined - GitHub Copilot, OpenAI, Claude, etc.]

### Integration Points

- GitHub API for issue creation
- Repository context awareness
- Existing project structure (`src/routes/`, `src/lib/`)

## User Experience Flow

### Basic Flow

1. User initiates conversation: "Create an issue for..."
2. Chatbot asks clarifying questions:
   - What type of issue? (bug, feature, enhancement, documentation)
   - What's the problem or goal?
   - Who is affected? (for user stories)
   - What's the expected outcome?
3. Chatbot presents formatted issue preview
4. User confirms or requests edits
5. Issue created in GitHub repository

### Advanced Features (Future)

- **Template Selection**: Bug report, feature request, user story, spike
- **Label Suggestion**: Auto-suggest labels based on content
- **Milestone Assignment**: Suggest or assign to milestones
- **Assignee Recommendation**: Based on code ownership or expertise
- **Related Issues**: Detect and link related existing issues
- **Epic Linking**: For user stories, suggest parent epic

## Agile User Story Guidelines

### INVEST Principles

- **Independent**: Can be developed separately
- **Negotiable**: Details can be discussed
- **Valuable**: Delivers value to users
- **Estimable**: Can be sized/estimated
- **Small**: Fits in a sprint
- **Testable**: Clear acceptance criteria

### Example User Story

**Good Example:**

```
**As a** developer
**I want** to create GitHub issues through a conversational chatbot
**So that** I can quickly document work items without breaking my flow

### Acceptance Criteria
- [ ] Given I'm in the chat interface, when I describe an issue, then the chatbot asks clarifying questions
- [ ] Given the chatbot has gathered details, when I confirm, then an issue is created in GitHub
- [ ] Given the issue is created, when I check GitHub, then it appears with proper formatting
- [ ] Given I want a user story format, when I specify that, then the issue follows Agile best practices

### Additional Details
- Support both quick issue creation and detailed user story format
- Include preview before final submission
- Handle authentication with GitHub API

### Definition of Done
- [ ] Chat interface accepts natural language input
- [ ] Issue created successfully in GitHub
- [ ] User story format option available
- [ ] Error handling for API failures
- [ ] Unit tests for issue formatting logic
```

## Implementation Considerations

### Phase 1: MVP

- Basic chat interface for issue creation
- Simple form-based conversation
- Direct GitHub API integration
- Plain issue format (not user stories)

### Phase 2: Enhanced

- User story formatting option
- Preview and edit capabilities
- Label and milestone suggestions
- Template selection

### Phase 3: Advanced

- AI-powered clarifying questions
- Context awareness from codebase
- Bulk issue creation
- Issue templates with dynamic fields

## Configuration Needed

### Environment Variables

```
GITHUB_TOKEN=<personal_access_token>
GITHUB_REPO_OWNER=<username_or_org>
GITHUB_REPO_NAME=<repository_name>
```

### GitHub Token Permissions

- `repo` scope for private repositories
- `public_repo` scope for public repositories

## API Endpoints to Implement

### `/api/github/issues/create` (POST)

- Accepts issue data
- Formats according to preferences
- Creates issue via GitHub API
- Returns created issue URL and number

### `/api/github/issues/preview` (POST)

- Accepts partial issue data
- Returns formatted preview
- Does not create issue

## UI Components Needed

### Chat Interface

- Message history display
- Input field for user responses
- Suggested responses/buttons
- Issue preview card

### Issue Preview

- Formatted markdown display
- Edit button for corrections
- Confirm/Cancel actions
- Link to created issue

## Testing Strategy

- Unit tests for user story formatting logic
- Integration tests for GitHub API calls
- E2E tests for complete issue creation flow
- Validation of Agile user story structure

## Success Metrics

- Time to create issue (vs manual GitHub UI)
- User story quality score (follows INVEST)
- User satisfaction with created issues
- Adoption rate among team members

## Open Questions

1. Which AI/chat backend to use?
2. Should we support offline mode (local drafts)?
3. Do we need user authentication or use repo-level token?
4. Should we integrate with project boards automatically?
5. How to handle issue templates already in `.github/ISSUE_TEMPLATE/`?
6. Do we want to support issue editing after creation?

## Resources

- [GitHub Issues API Documentation](https://docs.github.com/en/rest/issues)
- [Agile User Stories Guide](https://www.atlassian.com/agile/project-management/user-stories)
- [INVEST Criteria](https://en.wikipedia.org/wiki/INVEST_(mnemonic))
- [Writing Acceptance Criteria](https://www.thoughtworks.com/insights/blog/agile-project-management/how-to-write-good-user-stories)

## Next Steps

- [ ] Define exact user story format preferences for this team
- [ ] Choose chat/AI integration approach
- [ ] Set up GitHub API authentication
- [ ] Create basic chat UI component
- [ ] Implement issue formatting logic
- [ ] Build GitHub API integration
- [ ] Add preview functionality
- [ ] Deploy and test with team

---

**Last Updated**: 2025-11-01 **Status**: Planning Phase **Owner**: [Your
Name/Team]
