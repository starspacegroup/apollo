# AI Chat Feature (Text + Voice)

This application provides seamless text and voice chat with AI powered by
OpenAI's Realtime API and Cloudflare Workers.

## Features

- 💬 **Text chat** - Type messages to chat with AI (no microphone required)
- 🎤 **Real-time voice input** - Speak naturally and the AI will respond
- 🔊 **Voice responses** - Hear the AI respond in natural speech
- 📝 **Live transcription** - See transcripts of both your speech and AI
  responses
- 🔄 **Seamless switching** - Start with text, add voice anytime, or switch back
  to text
- 🌐 **Cloudflare Workers** - Serverless WebSocket proxy for OpenAI connection
- ⚡ **Low latency** - Direct WebSocket connection for minimal delay

## Setup Instructions

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key with access to the Realtime API (GPT-4o Realtime)
5. Copy your API key

### 2. Configure Environment Variables

For local development with `npm run dev`, create a `.env` file in the project
root:

```
OPENAI_API_KEY=your-openai-api-key-here
```

For production deployment to Cloudflare, set your OpenAI API key as a Cloudflare
Worker secret:

```powershell
npx wrangler secret put OPENAI_API_KEY
```

When prompted, paste your OpenAI API key.

### 3. Run the Application

**✅ Development Mode (Vite + WebSocket Plugin):**

```powershell
npm run dev
```

Voice chat now works with regular development mode! The custom Vite plugin
handles WebSocket connections. Navigate to `http://localhost:5252/chat`

**📦 Build and Preview with Wrangler:**

```powershell
npm run preview
```

This will build your app and run it with Wrangler on `http://localhost:8788`

**🚀 Deploy to Cloudflare:**

```powershell
npm run deploy
```

### 4. Access the AI Chat

Once running, navigate to:

- Local: `http://localhost:5173/chat`
- Production: `https://your-domain.pages.dev/chat`

## Usage

### Text Chat (Default)

1. Open the application - no setup required
2. Type your message in the text input at the bottom
3. Press `Enter` to send (or `Shift+Enter` for new line)
4. The WebSocket connection establishes automatically on first message
5. AI responds with text that appears in the transcript

### Voice Chat (Optional)

1. Click the "Start Voice Chat" button
2. Grant microphone permission when prompted
3. Speak naturally - the AI will listen and respond
4. Your speech and AI responses are transcribed in real-time
5. Click "Stop Voice" to return to text-only mode

### Seamless Switching

- Start with **text chat** if you prefer typing or are in a quiet environment
- **Add voice** anytime during the conversation by clicking "Start Voice Chat"
- **Stop voice** and continue with text in the same session
- **End Session** to disconnect and clear the conversation

## How It Works

### Architecture

1. **Frontend (SvelteKit)** - `VoiceChat.svelte` component
   - Captures microphone input using Web Audio API
   - Converts audio to PCM16 format
   - Establishes WebSocket connection to backend
   - Plays audio responses from AI
   - Displays conversation transcript

2. **Backend (Cloudflare Worker)** - `/api/voice` endpoint
   - Accepts WebSocket connections from frontend
   - Proxies connection to OpenAI Realtime API
   - Forwards audio data bidirectionally
   - Handles session configuration

3. **OpenAI Realtime API**
   - Processes voice input with Whisper
   - Generates responses with GPT-4o
   - Converts text to speech
   - Provides real-time transcription

### Audio Format

- **Input**: PCM16 format, 24kHz sample rate
- **Output**: PCM16 format, 24kHz sample rate
- **Encoding**: Base64 for WebSocket transmission

### Voice Detection

Server-side Voice Activity Detection (VAD) is enabled with:

- Threshold: 0.5
- Prefix padding: 300ms
- Silence duration: 500ms

## Usage

1. Click "Start Voice Chat" to begin
2. Allow microphone permissions when prompted
3. Start speaking - the AI will listen
4. The AI will respond when you pause
5. View transcripts in real-time
6. Click "Stop" to end the session

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

## Technologies Used

- **SvelteKit** - Frontend framework
- **Cloudflare Workers** - Serverless backend
- **OpenAI Realtime API** - AI voice processing
- **Web Audio API** - Audio capture and playback
- **WebSocket** - Real-time communication
