# Text and voice, one conversation

There is one conversation and two ways into it. Typing and speaking append to
the same transcript, the same session, the same repository context — you can
start a thought by voice and finish it by typing, and the model sees one
history rather than two.

## The wire

The browser does not talk to OpenAI directly; the key never reaches the client.

```
browser  ──WebSocket──>  the Worker  ──WebSocket──>  OpenAI Realtime API
```

`src/routes/api/voice/+server.ts` is the relay. It opens the upstream socket,
sends the session config, forwards audio and text both ways, and executes tool
calls against GitHub as they arrive. `src/lib/server/voiceProtocol.ts` holds
the config and the close-code mapping, both under test.

In development the same relay is provided by `vite-plugin-voice-ws.ts`, because
Vite's dev server does not run the Worker.

## The session config

- **Model:** `gpt-4o-mini-realtime-preview`, named once in
  `src/lib/realtimeModel.ts`.
- **Modalities:** text and audio.
- **Voice:** `alloy`.
- **Audio:** PCM16 in and out; input transcribed by `whisper-1`.
- **Turn detection:** server VAD, threshold `0.6`, 300 ms prefix padding, 800 ms
  of silence to end a turn.
- **Tools:** the seven GitHub functions, with `tool_choice: 'auto'`. See
  [`github.md`](github.md).

Those VAD numbers are the ones that make a normal speaking pause not end your
turn. Shortening `silence_duration_ms` makes the assistant interrupt you.

## Images

The current model takes text and audio only. The composer refuses an image
attachment up front and tells you which line to change, rather than letting the
photograph vanish into a turn that errors upstream. `modelSeesImages()` is the
check; pointing `OPENAI_REALTIME_MODEL` at `gpt-realtime` enables it, at a
different price.

## Browser requirements

A microphone, `getUserMedia`, and WebSocket support. Chrome and Edge are the
tested pair. Safari's audio worklet behaviour has not been checked. The page
must be served over HTTPS or from `localhost`, or the browser will not grant
the microphone.

## Cost

Realtime audio is billed per minute of input and output and is the expensive
part of this app by a wide margin. An idle open socket with VAD listening still
sends audio. Close the connection when the conversation is done — the UI does
this on navigate, but a backgrounded tab left open is a real bill.
