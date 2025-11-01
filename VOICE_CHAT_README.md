# AI Voice Chat Feature

This application provides real-time voice chat with AI powered by OpenAI's
Realtime API and Cloudflare Workers.

## Features

- 🎤 **Real-time voice input** - Speak naturally and the AI will respond
- 🔊 **Voice responses** - Hear the AI respond in natural speech
- 📝 **Live transcription** - See transcripts of both your speech and AI
  responses
- 🌐 **Cloudflare Workers** - Serverless WebSocket proxy for OpenAI connection
- ⚡ **Low latency** - Direct WebSocket connection for minimal delay

## Setup Instructions

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key with access to the Realtime API (GPT-4o Realtime)
5. Copy your API key

### 2. Configure Cloudflare Secret

Set your OpenAI API key as a Cloudflare Worker secret:

```powershell
npx wrangler secret put OPENAI_API_KEY
```

When prompted, paste your OpenAI API key.

For local development, create a `.dev.vars` file in the project root:

```
OPENAI_API_KEY=your-openai-api-key-here
```

### 3. Run the Application

**⚠️ Important: WebSocket support requires Wrangler**

The voice chat uses WebSockets, which are NOT supported by Vite's dev server.
You must use `npm run preview` to test the voice chat locally.

**Build and preview with Wrangler (required for voice chat):**

```powershell
npm run preview
```

This will build your app and run it with Wrangler on `http://localhost:8788`

**Regular development (for other features):**

```powershell
npm run dev
```

Note: The voice chat will show "Disconnected" in regular dev mode.

**Deploy to Cloudflare:**

```powershell
npm run deploy
```

### 4. Access the Voice Chat

Once running, navigate to:

- Local: `http://localhost:5173/voice`
- Production: `https://your-domain.pages.dev/voice`

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

## Security Notes

- ⚠️ Never commit your `.dev.vars` file
- ⚠️ Always use Cloudflare secrets for production
- ⚠️ The API key is never exposed to the frontend
- ✅ All connections use secure WebSocket (WSS)

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
