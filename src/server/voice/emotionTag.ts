/**
 * Leading emotion-tag protocol for streamed replies.
 *
 * The non-streaming `/api/chat` endpoint asks the model for a JSON object
 * (`{reply, emotion}`). That is fine for a single response, but it cannot be
 * streamed: the client would have to parse partial JSON.
 *
 * For the streaming path the model instead prefixes its reply with a tag:
 *
 *     [[emotion:happiness]]Very good, Sir. The reactor is stable.
 *
 * The server strips the tag and emits the emotion as a discrete event, then
 * streams the remaining prose. The tag may be split across arbitrary chunk
 * boundaries, so parsing has to be incremental — which is what this module does.
 */

export const EMOTIONS = [
  'happiness',
  'curiosity',
  'confusion',
  'empathy',
  'excitement',
  'neutral',
] as const;

export type StreamEmotion = (typeof EMOTIONS)[number];

const TAG_PREFIX = '[[emotion:';
/** Upper bound on how long we will hold text waiting for a closing `]]`. */
const MAX_TAG_SCAN = 64;

export interface EmotionTagParse {
  /** The parsed emotion, if a complete tag was found. */
  emotion?: StreamEmotion;
  /** Text that should be emitted to the client (tag removed). */
  rest: string;
  /** True once the tag has been resolved (found, or determined absent). */
  resolved: boolean;
}

/**
 * Inspects the head of a stream buffer for an emotion tag.
 *
 * Call repeatedly as chunks arrive. While `resolved` is false the caller must
 * keep buffering and must not emit anything.
 */
export function parseEmotionTag(buffer: string): EmotionTagParse {
  // Still could become a tag -> keep waiting.
  if (TAG_PREFIX.startsWith(buffer)) {
    return { rest: '', resolved: false };
  }

  if (!buffer.startsWith(TAG_PREFIX)) {
    // No tag at all: the model answered in plain prose.
    return { rest: buffer, resolved: true };
  }

  const closeIndex = buffer.indexOf(']]');
  if (closeIndex === -1) {
    // Incomplete tag. Give up waiting if it is implausibly long.
    if (buffer.length > MAX_TAG_SCAN) {
      return { rest: buffer, resolved: true };
    }
    return { rest: '', resolved: false };
  }

  const raw = buffer.slice(TAG_PREFIX.length, closeIndex).trim().toLowerCase();
  const emotion = (EMOTIONS as readonly string[]).includes(raw)
    ? (raw as StreamEmotion)
    : 'neutral';

  return { emotion, rest: buffer.slice(closeIndex + 2), resolved: true };
}

/** Instruction fragment telling the model to emit the tag. */
export const STREAM_EMOTION_INSTRUCTION = `
Begin every reply with exactly one emotion tag in the form [[emotion:NAME]] where
NAME is one of: ${EMOTIONS.join(', ')}. Immediately after the tag, write your spoken
reply as plain prose. Do not use JSON, markdown, bullet lists or code fences.`;
