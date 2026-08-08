import { describe, expect, it } from 'vitest';
import {
	OPENAI_REALTIME_MODEL,
	openAIRealtimeUrl,
	relayCloseCode,
	voiceSessionConfig
} from './voiceProtocol';

describe('voice relay protocol', () => {
	it('uses the canonical realtime model and audio/VAD settings', () => {
		const config = voiceSessionConfig('instructions');

		expect(new URL(openAIRealtimeUrl()).searchParams.get('model')).toBe(OPENAI_REALTIME_MODEL);
		expect(config.session).toMatchObject({
			modalities: ['text', 'audio'],
			voice: 'alloy',
			input_audio_format: 'pcm16',
			output_audio_format: 'pcm16',
			turn_detection: {
				threshold: 0.6,
				prefix_padding_ms: 300,
				silence_duration_ms: 800
			}
		});
	});

	it('enables tool calling only when a relay supplies tools', () => {
		const withoutTools = voiceSessionConfig('instructions').session;
		const withTools = voiceSessionConfig('instructions', [{ name: 'list_issues' }]).session;

		expect(withoutTools).not.toHaveProperty('tools');
		expect(withTools).toMatchObject({ tools: [{ name: 'list_issues' }], tool_choice: 'auto' });
	});

	it('preserves valid close codes and normalizes reserved codes', () => {
		expect(relayCloseCode(1001)).toBe(1001);
		expect(relayCloseCode(4001)).toBe(4001);
		expect(relayCloseCode(1006)).toBe(1000);
		expect(relayCloseCode(999)).toBe(1000);
	});
});
