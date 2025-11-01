import type { Plugin } from 'vite';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env or .dev.vars file
function loadEnvFile(): Record<string, string> {
  // Try .dev.vars first (used by Wrangler), then fall back to .env
  const envPaths = [
    join(process.cwd(), '.dev.vars'),
    join(process.cwd(), '.env')
  ];

  const env: Record<string, string> = {};

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      console.log(`Loading environment variables from ${envPath}`);
      const content = readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || !line.trim()) return;

        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          // Only set if not already set (first file wins)
          if (!env[key]) {
            env[key] = value;
          }
        }
      });
    }
  }

  return env;
}

const GITHUB_ISSUE_INSTRUCTIONS = `You are a helpful AI assistant specialized in creating well-formed GitHub issues. You help users through a conversational interface to gather issue details and format them according to Agile best practices.

Here is your complete project context and guidelines:

{{CONTEXT}}

Your role is to:
1. Help users create GitHub issues through natural conversation
2. Ask clarifying questions to gather all necessary details
3. Format issues as proper Agile user stories when appropriate
4. Follow the INVEST principles for user stories
5. Provide clear acceptance criteria and definitions of done
6. Be conversational, friendly, and guide users through the process

Respond in a conversational manner and help users create high-quality, well-structured GitHub issues.`;

function setupOpenAIConnection(clientWs: WebSocket, OPENAI_API_KEY: string) {
  // Connect to OpenAI Realtime API
  const url = new URL('wss://api.openai.com/v1/realtime');
  url.searchParams.set('model', 'gpt-4o-realtime-preview-2024-10-01');

  const openaiWs = new WebSocket(url.toString(), {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  // Forward messages from client to OpenAI
  clientWs.on('message', (data) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(data.toString());
    }
  });

  // Forward messages from OpenAI to client
  openaiWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data.toString());
    }
  });

  // Handle OpenAI connection open
  openaiWs.on('open', () => {
    console.log('Connected to OpenAI Realtime API');

    // Load GitHub Issue context
    const githubIssueContext = readFileSync(join(process.cwd(), 'GITHUB_ISSUE_CHATBOT.md'), 'utf-8');

    // Build instructions with GitHub Issue Chatbot context
    const instructions = GITHUB_ISSUE_INSTRUCTIONS.replace('{{CONTEXT}}', githubIssueContext);

    // Send session configuration
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.6,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        }
      }
    };

    openaiWs.send(JSON.stringify(sessionConfig));
  });

  // Handle errors
  openaiWs.on('error', (error) => {
    console.error('OpenAI WebSocket error:', error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'OpenAI connection error');
    }
  });

  // Handle OpenAI connection close
  openaiWs.on('close', (code, reason) => {
    console.log('OpenAI connection closed:', code, reason.toString());
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason.toString());
    }
  });

  // Handle client connection close
  clientWs.on('close', (code, reason) => {
    console.log('Client connection closed:', code, reason.toString());
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close(code, reason.toString());
    }
  });
}

export function voiceWebSocketPlugin(): Plugin {
  // Load environment variables once when plugin is initialized
  const envVars = loadEnvFile();

  return {
    name: 'voice-websocket',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        // Only handle /api/voice WebSocket upgrades
        if (request.url !== '/api/voice') {
          return;
        }

        // Try to get API key from process.env first, then fall back to our loaded env vars
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY || envVars.OPENAI_API_KEY;

        if (!OPENAI_API_KEY) {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
          console.error('OPENAI_API_KEY not found in environment variables');
          console.error('Please add OPENAI_API_KEY to your .env file');
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('Client connected to voice WebSocket');
          setupOpenAIConnection(ws, OPENAI_API_KEY);
        });
      });
    }
  };
}
