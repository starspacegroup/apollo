/**
 * Which realtime model this interface talks to, and what it can take in.
 *
 * The name is not a secret and both halves need it: the relay uses it to build
 * the socket URL, and the composer uses it to decide whether an image may be
 * attached at all. It lives here rather than in `server/` so the browser can
 * import it without pulling a server module into the bundle.
 */
export const OPENAI_REALTIME_MODEL = 'gpt-4o-mini-realtime-preview';

/**
 * Realtime models that accept an `input_image` part in a conversation item.
 *
 * This is a real limit and not a precaution. The `gpt-4o-*-realtime-preview`
 * family takes text and audio only; sending it an image produces an error from
 * OpenAI and the turn is lost. So the composer refuses the attachment up front
 * and says which line to change, which is better than a photograph disappearing
 * into a failed turn.
 *
 * To let images through: point `OPENAI_REALTIME_MODEL` above at a model in this
 * list. It is a different model with a different price, so it is David's change
 * to make, not one to arrive by surprise.
 */
const SEES_IMAGES = ['gpt-realtime', 'gpt-realtime-mini'];

export function modelSeesImages(model: string = OPENAI_REALTIME_MODEL): boolean {
	return SEES_IMAGES.some((m) => model === m || model.startsWith(`${m}-20`));
}

/** The sentence the composer shows when an image cannot be sent. */
export function whyNoImages(model: string = OPENAI_REALTIME_MODEL): string {
	return `${model} takes text and audio only, so an image cannot go into this conversation. Point OPENAI_REALTIME_MODEL at gpt-realtime to enable it — a different model, at a different price.`;
}
