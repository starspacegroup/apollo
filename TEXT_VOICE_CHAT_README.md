# Text and Voice Chat Integration

## Overview

The AI Chat feature provides seamless integration between text and voice
communication with the AI assistant. You can start with either mode and switch
between them at any time during the same conversation session.

## Features

### 1. **Text Chat (Always Available)**

- Type messages to chat with the AI at any time
- No microphone access required
- Press `Enter` to send, `Shift+Enter` for new line
- Messages appear instantly in the transcript

### 2. **Voice Chat (Optional)**

- Click "Start Voice Chat" to enable voice mode
- Requires microphone permission
- Real-time speech-to-text transcription
- AI responds with both voice and text
- Click "Stop Voice" to return to text-only mode

### 3. **Seamless Switching**

- Start with text chat without any connection
- Add voice chat at any time during the conversation
- Stop voice chat and continue with text in the same session
- All messages (text and voice) appear in the same transcript

## How It Works

### Connection Management

1. **Initial State**: Application starts without any WebSocket connection
2. **Text Chat**: When you send your first text message, a WebSocket connection
   is established
3. **Voice Mode**: Clicking "Start Voice Chat" requests microphone access and
   enables audio streaming
4. **Stop Voice**: Stopping voice chat releases microphone but keeps the
   WebSocket connection for text chat
5. **End Session**: The "End Session" button fully disconnects and clears the
   conversation

### Audio Processing

- **Input**: Microphone audio is converted to PCM16 format and streamed to
  OpenAI
- **Output**: AI responses are received as audio chunks and played back
  seamlessly
- **VAD (Voice Activity Detection)**: Server-side detection automatically
  commits audio when you stop speaking

### Text Processing

- **Text messages** are sent as conversation items to OpenAI
- **AI responses** can include both text and audio transcripts
- **Transcript** updates in real-time for both modalities

## User Interface

### Components

1. **Header**
   - Shows connection status (Ready/Connected)
   - Displays application title

2. **Transcript Container**
   - Shows conversation history
   - Differentiates between user and AI messages
   - Scrollable for long conversations
   - Empty state with helpful hints

3. **Text Input (Always Visible)**
   - Expandable textarea
   - Send button (disabled when empty)
   - Keyboard shortcuts for convenience

4. **Controls**
   - "Start Voice Chat" / "Stop Voice" button
   - Recording indicator (when listening)
   - Speaking indicator (when AI is talking)
   - "End Session" button (when connected)

## Usage Examples

### Example 1: Text-Only Conversation

```
1. User types: "What's the weather like today?"
2. WebSocket connects automatically
3. AI responds with text
4. Conversation continues via text
```

### Example 2: Adding Voice to Text Chat

```
1. User starts with text messages
2. User clicks "Start Voice Chat"
3. Microphone access granted
4. User can now speak or type
5. AI responds with voice and text
```

### Example 3: Switching Back to Text

```
1. User is in voice chat mode
2. User clicks "Stop Voice"
3. Microphone released
4. User continues with text messages
5. AI responds with text only
```

## Technical Details

### State Management

- `isConnected`: WebSocket connection status
- `isVoiceMode`: Whether voice features are active
- `isRecording`: Whether microphone is capturing audio
- `isSpeaking`: Whether AI is playing audio response
- `processingResponse`: Whether AI is generating a response

### API Communication

The application communicates with OpenAI's Realtime API via WebSocket:

- **Session configuration**: Sets up audio format, voice, and VAD settings
- **Text messages**: Sent as conversation items
- **Audio streaming**: PCM16 audio chunks sent/received
- **Transcription**: Both user speech and AI responses are transcribed

### Error Handling

- Connection errors display user-friendly messages
- Microphone access failures handled gracefully
- Audio playback errors logged and recovered
- WebSocket reconnection on disconnection

## Configuration

The session is configured with:

- **Modalities**: Both text and audio
- **Voice**: "alloy" (OpenAI voice)
- **Audio Format**: PCM16 at 24kHz
- **VAD**: Server-side voice activity detection
- **Transcription**: Whisper-1 for speech-to-text

## Browser Requirements

- Modern browser with WebSocket support
- Microphone access for voice features
- Web Audio API support for audio playback
- Good internet connection for real-time communication

## Best Practices

1. **Start with text** if you're in a quiet environment or prefer typing
2. **Use voice** when you want hands-free interaction
3. **Stop voice** if background noise is interfering
4. **End session** when you're done to free up resources
5. **Check status indicator** to confirm connection state
