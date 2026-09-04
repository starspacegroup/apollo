// The model id and its input capabilities live in `$lib/realtimeModel`, so the
// composer can read them too without importing a server module. Re-exported
// here because this file's callers and its test have always asked for it.
export { OPENAI_REALTIME_MODEL, modelSeesImages } from '../realtimeModel';
import { OPENAI_REALTIME_MODEL } from '../realtimeModel';

export function openAIRealtimeUrl(): string {
	const url = new URL('wss://api.openai.com/v1/realtime');
	url.searchParams.set('model', OPENAI_REALTIME_MODEL);
	return url.toString();
}

export function voiceSessionConfig(instructions: string, tools: unknown[] = []) {
	return {
		type: 'session.update',
		session: {
			modalities: ['text', 'audio'],
			instructions,
			voice: 'alloy',
			input_audio_format: 'pcm16',
			output_audio_format: 'pcm16',
			input_audio_transcription: { model: 'whisper-1' },
			turn_detection: {
				type: 'server_vad',
				threshold: 0.6,
				prefix_padding_ms: 300,
				silence_duration_ms: 800
			},
			...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {})
		}
	};
}

export function relayCloseCode(code: number): number {
	return code >= 1000 && code <= 4999 && ![1005, 1006, 1015].includes(code) ? code : 1000;
}
