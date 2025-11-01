# Apollo - AI-Powered GitHub Assistant

Apollo is an AI assistant that seamlessly integrates with GitHub, providing
intelligent text and voice chat capabilities powered by OpenAI's Realtime API
and Cloudflare Workers.

## Features

### Core Chat Features

- 💬 **Text chat** - Type messages to chat with AI (no microphone required)
- 🎤 **Real-time voice input** - Speak naturally and the AI will respond
- 🔊 **Voice responses** - Hear the AI respond in natural speech
- 📝 **Live transcription** - See transcripts of both your speech and AI
  responses
- 🔄 **Seamless switching** - Start with text, add voice anytime, or switch back
  to text
- ⚡ **Low latency** - Direct WebSocket connection for minimal delay

### GitHub Integration

- 🔗 **GitHub Authentication** - Sign in with your GitHub account
- 📁 **Repository Selection** - Choose any repository you have access to
- 🎯 **Context-Aware AI** - AI has full access to your repository's code and
  structure
- 🐛 **Issue Management** - Create and manage GitHub issues through conversation
- 📋 **Project Management** - Get help organizing and planning your projects
- 🔍 **Code Intelligence** - Ask questions about your codebase and get
  intelligent answers

## Setup Instructions

### 1. GitHub OAuth Setup

1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Create a new OAuth App
3. Set Authorization callback URL to:
   `http://localhost:5173/auth/callback/github` (for production, use your
   deployed URL)
4. Copy the Client ID and generate a Client Secret
5. See `GITHUB_AUTH_SETUP.md` for detailed instructions

### 2. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key with access to the Realtime API (GPT-4o Realtime)
5. Copy your API key

### 3. Configure Environment Variables

For local development with `npm run dev`, create a `.env` file in the project
root:

```
OPENAI_API_KEY=your-openai-api-key-here
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
AUTH_SECRET=your-random-secret-string
```

For production deployment to Cloudflare, set your secrets as Cloudflare Worker
secrets:

```powershell
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put AUTH_SECRET
```

When prompted, paste each respective value.

### 4. Run the Application

**✅ Development Mode (Vite + WebSocket Plugin):**

```powershell
npm run dev
```

Voice chat now works with regular development mode! The custom Vite plugin
handles WebSocket connections. Navigate to `http://localhost:5173`

**📦 Build and Preview with Wrangler:**

```powershell
npm run preview
```

This will build your app and run it with Wrangler on `http://localhost:8788`

**🚀 Deploy to Cloudflare:**

```powershell
npm run deploy
```

### 5. Sign In and Select Repository

1. Once running, navigate to the application
   - Local: `http://localhost:5173`
   - Production: `https://your-domain.pages.dev`
2. Click "Sign in with GitHub" in the top-right corner
3. Authorize the application to access your GitHub account
4. Select a repository from your available repositories
5. Start chatting with Apollo about your codebase!

## Usage

### Getting Started

1. **Sign in** with your GitHub account
2. **Select a repository** you want to work with
3. Start chatting with Apollo about your code!

### Text Chat (Default)

1. Type your message in the text input at the bottom
2. Press `Enter` to send (or `Shift+Enter` for new line)
3. Ask Apollo about your code, request explanations, or get help with issues
4. Apollo has full context of your selected repository

### Voice Chat (Optional)

1. Click the waveform button (voice icon) at the bottom-right
2. Grant microphone permission when prompted
3. Speak naturally - Apollo will listen and respond with voice
4. Your speech and Apollo's responses are transcribed in real-time
5. Click the stop button to return to text-only mode

### Working with GitHub

**Ask about your code:**

- "What does the main function do in app.js?"
- "Explain how authentication works in this project"
- "Show me all the API endpoints"

**Create issues:**

- "Create an issue for fixing the login bug"
- "Add a task to improve error handling"
- Apollo will create GitHub issues based on your conversation

**Get project help:**

- "What should I work on next?"
- "Help me plan the new feature"
- "Review the recent changes"

### Switching Between Modes

- Start with **text chat** if you prefer typing or are in a quiet environment
- **Add voice** anytime during the conversation by clicking the voice button
- **Stop voice** and continue with text in the same session
- **Change repository** anytime using the repository badge in the top bar

## How It Works

### Architecture

1. **Frontend (SvelteKit)** - Main application
   - `VoiceChat.svelte` - Chat interface with voice/text capabilities
   - `RepoSelector.svelte` - Repository selection modal
   - Captures microphone input using Web Audio API
   - Converts audio to PCM16 format
   - Establishes WebSocket connection to backend
   - Plays audio responses from AI
   - Displays conversation transcript

2. **Authentication (Auth.js)**
   - GitHub OAuth integration
   - Session management
   - Access token handling for GitHub API

3. **Backend (Cloudflare Worker)** - `/api/voice` endpoint
   - Accepts WebSocket connections from frontend
   - Loads repository context from GitHub
   - Proxies connection to OpenAI Realtime API
   - Forwards audio data bidirectionally
   - Handles session configuration with repository context
   - Creates GitHub issues when requested

4. **OpenAI Realtime API**
   - Processes voice input with Whisper
   - Generates responses with GPT-4o
   - Has full context of the selected repository
   - Converts text to speech
   - Provides real-time transcription

5. **GitHub API Integration**
   - Fetches repository content
   - Creates and manages issues
   - Accesses project information

### Audio Format

- **Input**: PCM16 format, 24kHz sample rate
- **Output**: PCM16 format, 24kHz sample rate
- **Encoding**: Base64 for WebSocket transmission

### Voice Detection

Server-side Voice Activity Detection (VAD) is enabled with:

- Threshold: 0.5
- Prefix padding: 300ms
- Silence duration: 500ms

## Quick Start Guide

1. **Sign in** with GitHub (top-right corner)
2. **Select a repository** from the modal
3. Start **typing or talking** to Apollo
4. Ask questions about your code or request actions
5. Apollo can **create GitHub issues** directly from conversation
6. **Switch repositories** anytime using the repository badge
7. **Toggle voice mode** with the waveform button

## Technical Details

### Development vs Production

**Development Mode (`npm run dev`):**

- Uses custom Vite plugin (`vite-plugin-voice-ws.ts`) to handle WebSocket
  connections
- WebSocket server runs on the same port as Vite dev server
- OpenAI API key loaded from `.env` file via `process.env.OPENAI_API_KEY`

**Production Mode (Cloudflare Workers):**

- Uses Cloudflare's native `WebSocketPair` API
- WebSocket connections handled by Cloudflare's edge network
- OpenAI API key loaded from Cloudflare Worker secrets

## Security Notes

- ⚠️ Never commit your `.env` or `.dev.vars` files (they're in `.gitignore`)
- ⚠️ Always use Cloudflare secrets for production
- ⚠️ The API key is never exposed to the frontend
- ✅ All connections use secure WebSocket (WSS in production, WS in dev)

## Browser Requirements

- Modern browser with Web Audio API support
- Microphone access permission
- WebSocket support
- HTTPS connection (required for microphone access)

## Troubleshooting

**"Microphone access denied"**

- Check browser permissions
- Ensure you're on HTTPS (localhost is okay)

**"Connection error"**

- Verify OPENAI_API_KEY is set correctly
- Check Cloudflare Worker logs
- Ensure OpenAI account has Realtime API access

**"No audio playback"**

- Check browser audio settings
- Verify audio output device
- Check browser console for errors

## Cost Considerations

OpenAI Realtime API pricing (as of 2024):

- Audio input: $0.06 per minute
- Audio output: $0.24 per minute
- Cached audio input: $0.024 per minute

Monitor your usage in the OpenAI dashboard.

## Future Enhancements

- [ ] Add conversation history persistence
- [ ] Support multiple voice options
- [ ] Implement push-to-talk mode
- [ ] Add conversation export
- [ ] Multi-language support
- [ ] Custom AI instructions per session
- [ ] Pull request creation and management
- [ ] Code review capabilities
- [ ] Project board integration
- [ ] Commit history analysis

## Technologies Used

- **SvelteKit** - Frontend framework
- **Cloudflare Workers** - Serverless backend
- **OpenAI Realtime API** - AI voice processing with repository context
- **GitHub API** - Repository access and issue management
- **Auth.js** - Authentication with GitHub OAuth
- **Web Audio API** - Audio capture and playback
- **WebSocket** - Real-time communication
