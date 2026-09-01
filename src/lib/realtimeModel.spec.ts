import { describe, it, expect } from 'vitest';
import { OPENAI_REALTIME_MODEL, modelSeesImages, whyNoImages } from './realtimeModel';

describe('what the realtime model can take in', () => {
	it('knows the 4o-mini preview cannot see', () => {
		// The model this interface is pointed at today. If someone changes it,
		// this line is where they find out what else changes with it.
		expect(OPENAI_REALTIME_MODEL).toBe('gpt-4o-mini-realtime-preview');
		expect(modelSeesImages()).toBe(false);
		expect(modelSeesImages('gpt-4o-realtime-preview')).toBe(false);
	});

	it('knows which ones can, including a dated snapshot', () => {
		expect(modelSeesImages('gpt-realtime')).toBe(true);
		expect(modelSeesImages('gpt-realtime-mini')).toBe(true);
		expect(modelSeesImages('gpt-realtime-2025-08-28')).toBe(true);
	});

	it('does not match a model that merely starts with the same letters', () => {
		// `startsWith` on a bare name would let anything through.
		expect(modelSeesImages('gpt-realtimeish')).toBe(false);
		expect(modelSeesImages('')).toBe(false);
	});

	it('says which line to change rather than only saying no', () => {
		const why = whyNoImages();
		expect(why).toContain(OPENAI_REALTIME_MODEL);
		expect(why).toContain('OPENAI_REALTIME_MODEL');
		expect(why).toContain('gpt-realtime');
	});
});
