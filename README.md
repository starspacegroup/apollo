# Apollo SvelteKit App

A SvelteKit application with real-time AI voice chat, powered by Cloudflare
Workers and OpenAI.

## Features

🎤 **AI Voice Chat** - Real-time voice conversation with AI using OpenAI's
Realtime API ⚡ **Cloudflare Workers** - Serverless WebSocket proxy for optimal
performance 🌐 **SvelteKit** - Modern full-stack framework with excellent DX

## Quick Start

### Voice Chat Setup

1. **Get OpenAI API Key**: Visit
   [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Run setup script**: `.\setup-voice-chat.ps1` (or manually create
   `.dev.vars`)
3. **Start dev server**: `npm run dev`
4. **Open chat**: Navigate to `http://localhost:5173/chat`

For detailed instructions, see [VOICE_CHAT_README.md](./VOICE_CHAT_README.md)

## Developing

Once you've created a project and installed dependencies with `npm install` (or
`pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an
> [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
