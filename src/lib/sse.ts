/**
 * Minimal Server-Sent Events parser.
 *
 * The voice endpoints stream events (`start`, `delta`, `sentence`, `audio`,
 * `done`, `error`). `EventSource` cannot be used because the requests are POSTs
 * with bodies and auth headers, so we parse the stream ourselves.
 *
 * Pure and framework-free so it can be unit tested with any async iterable.
 */

export interface SseEvent {
  /** The `event:` field; defaults to "message" when omitted, per the spec. */
  event: string;
  /** The concatenated `data:` lines. */
  data: string;
}

/** Parses a single SSE frame (the text between two blank lines). */
export function parseSseFrame(raw: string): SseEvent | null {
  if (!raw.trim()) return null;

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    // Blank lines and comments (`: keep-alive`) carry no data.
    if (!line || line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // `id` and `retry` fields are intentionally ignored.
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * Consumes an async iterable of text chunks and yields complete SSE events.
 *
 * Handles CRLF, LF and bare CR line endings, including a line ending that is
 * split across two chunks.
 */
export async function* parseSse(source: AsyncIterable<string>): AsyncGenerator<SseEvent> {
  let buffer = '';
  let carryCr = false;

  for await (const chunk of source) {
    let text = chunk;
    if (carryCr) {
      text = `\r${text}`;
      carryCr = false;
    }
    if (text.endsWith('\r')) {
      carryCr = true;
      text = text.slice(0, -1);
    }

    buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let separator: number;
    while ((separator = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const event = parseSseFrame(raw);
      if (event) yield event;
    }
  }

  if (carryCr) buffer += '\n';
  const trailing = parseSseFrame(buffer);
  if (trailing) yield trailing;
}

/** Parses an event's `data` as JSON, returning null instead of throwing. */
export function sseJson<T = unknown>(event: SseEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

/**
 * Adapts a `fetch` Response body into an async iterable of text chunks.
 * Falls back gracefully when the environment lacks a streaming reader.
 */
export async function* responseTextChunks(response: Response): AsyncGenerator<string> {
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text();
    if (text) yield text;
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock?.();
  }
}
