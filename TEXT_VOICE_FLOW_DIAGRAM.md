# Text and Voice Chat Flow Diagram

## User Journey Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Start                            │
│                  (No connection required)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Text Input Always Visible                       │
│          "Start chatting with AI using text or voice"           │
└─────────┬───────────────────────────────────┬───────────────────┘
          │                                   │
          │ User types message                │ User clicks
          │ and hits Enter                    │ "Start Voice Chat"
          ▼                                   ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│   Auto-connect WebSocket    │   │  Request Microphone Access   │
│   Send text message          │   │  Create Audio Context        │
│   AI responds with text      │   │  Enable voice recording      │
└─────────┬───────────────────┘   └────────────┬─────────────────┘
          │                                    │
          │                                    │
          └────────────┬───────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │   Connected Session    │
          │   (Text + Voice Mode)  │
          └────────┬───────────────┘
                   │
                   ├─────────────────────────────────────┐
                   │                                     │
                   ▼                                     ▼
    ┌──────────────────────────┐         ┌─────────────────────────┐
    │   User can type text     │         │  User can speak         │
    │   AI responds with text  │         │  AI responds with voice │
    └──────────────────────────┘         └─────────────────────────┘
                   │                                     │
                   │                                     │
                   │               User clicks           │
                   │              "Stop Voice"           │
                   │                     │               │
                   │                     ▼               │
                   │        ┌────────────────────────┐   │
                   │        │  Release microphone    │   │
                   │        │  Keep WebSocket open   │   │
                   │        │  Continue text chat    │   │
                   │        └────────┬───────────────┘   │
                   │                 │                   │
                   └─────────────────┴───────────────────┘
                                     │
                                     │ User clicks
                                     │ "End Session"
                                     ▼
                        ┌────────────────────────┐
                        │  Close WebSocket       │
                        │  Clear transcript      │
                        │  Release all resources │
                        └────────────────────────┘
```

## State Transitions

```
┌──────────────┐
│  Disconnected │ ◄──────────────────────────────┐
│              │                                 │
│ isConnected: false                            │
│ isVoiceMode: false                            │
└──────┬───────┘                                │
       │                                        │
       │ Send text message or                  │
       │ Start voice chat                      │
       ▼                                        │
┌──────────────┐                                │
│  Connected   │                                │
│  (Text Mode) │                                │
│              │                                │
│ isConnected: true                             │
│ isVoiceMode: false                            │
└──────┬───────┘                                │
       │                                        │
       │ Start voice chat                       │
       ▼                                        │
┌──────────────┐                                │
│  Connected   │                                │
│ (Voice Mode) │                                │
│              │                                │
│ isConnected: true                             │
│ isVoiceMode: true                             │
│ isRecording: true                             │
└──────┬───────┘                                │
       │                                        │
       ├──────────────────┐                     │
       │                  │                     │
       │ Stop voice       │ End session         │
       │                  │                     │
       ▼                  └─────────────────────┘
Back to Text Mode
```

## Resource Management

```
┌────────────────────────────────────────────────────────────┐
│                    Resource Lifecycle                      │
└────────────────────────────────────────────────────────────┘

Text Chat Mode:
├── WebSocket Connection     [Active]
├── Microphone              [Not Requested]
├── Audio Context           [Not Created]
└── Audio Processor         [Not Created]

Voice Chat Mode:
├── WebSocket Connection     [Active]
├── Microphone              [Active]
├── Audio Context           [Active]
├── Audio Processor         [Active]
└── Audio Queue             [Active]

Stop Voice (Back to Text):
├── WebSocket Connection     [Active]
├── Microphone              [Released]
├── Audio Context           [Closed]
├── Audio Processor         [Disconnected]
└── Audio Queue             [Cleared]

End Session:
├── WebSocket Connection     [Closed]
├── Microphone              [Released]
├── Audio Context           [Closed]
├── Audio Processor         [Disconnected]
├── Audio Queue             [Cleared]
└── Transcript              [Cleared]
```

## Message Flow

```
┌─────────────┐                ┌─────────────┐                ┌─────────────┐
│             │                │             │                │             │
│   Browser   │                │   Server    │                │   OpenAI    │
│             │                │  (Worker)   │                │  Realtime   │
└──────┬──────┘                └──────┬──────┘                └──────┬──────┘
       │                              │                              │
       │ WebSocket Connect            │                              │
       ├─────────────────────────────►│                              │
       │                              │ WebSocket Connect            │
       │                              ├─────────────────────────────►│
       │                              │                              │
       │                              │◄─────────────────────────────┤
       │◄─────────────────────────────┤ session.created              │
       │                              │                              │
       │ text message                 │                              │
       ├─────────────────────────────►│──────────────────────────────►
       │ (conversation.item.create)   │                              │
       │                              │                              │
       │ response.create              │                              │
       ├─────────────────────────────►│──────────────────────────────►
       │                              │                              │
       │                              │◄─────────────────────────────┤
       │◄─────────────────────────────┤ response.text.delta          │
       │                              │                              │
       │                              │◄─────────────────────────────┤
       │◄─────────────────────────────┤ response.done                │
       │                              │                              │
       │ [Start Voice]                │                              │
       │                              │                              │
       │ audio chunk (PCM16)          │                              │
       ├─────────────────────────────►│──────────────────────────────►
       │ (input_audio_buffer.append)  │                              │
       │                              │                              │
       │                              │◄─────────────────────────────┤
       │◄─────────────────────────────┤ response.audio.delta         │
       │ (play audio)                 │                              │
       │                              │                              │
       │                              │◄─────────────────────────────┤
       │◄─────────────────────────────┤ response.audio_transcript    │
       │ (show transcript)            │                              │
       │                              │                              │
```

## UI Component Structure

```
VoiceChat.svelte
│
├── Header
│   ├── Title: "AI Chat"
│   └── Status Indicator
│       ├── "Ready" (disconnected)
│       └── "Connected" (connected)
│
├── Error Message (if any)
│
├── Transcript Container
│   ├── Empty State (if no messages)
│   │   ├── "Start chatting with AI using text or voice"
│   │   └── Hint text
│   │
│   └── Messages (if conversation started)
│       ├── User Message
│       │   ├── Role: "You"
│       │   └── Text
│       │
│       └── AI Message
│           ├── Role: "AI"
│           └── Text
│
├── Text Input Container (Always Visible)
│   ├── Textarea
│   │   ├── Auto-expand
│   │   └── Keyboard shortcuts
│   │
│   └── Send Button
│       └── Disabled when empty
│
└── Controls
    ├── Voice Button
    │   ├── "Start Voice Chat" (if not in voice mode)
    │   └── "Stop Voice" (if in voice mode)
    │
    ├── Recording Indicator (if recording)
    │   ├── Pulsing dot
    │   └── "Listening..."
    │
    ├── Speaking Indicator (if AI speaking)
    │   ├── Wave animation
    │   └── "AI Speaking..."
    │
    └── End Session Button (if connected)
        └── Fully disconnect
```
