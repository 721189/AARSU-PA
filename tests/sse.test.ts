import { describe, it, expect } from 'vitest';
import { parseSseFrame, parseSse, sseJson } from '../src/lib/sse';

async function* chunks(...parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part;
}

async function collect(source: AsyncIterable<string>) {
  const out = [];
  for await (const event of parseSse(source)) out.push(event);
  return out;
}

describe('parseSseFrame', () => {
  it('parses an event name and a JSON payload', () => {
    expect(parseSseFrame('event: chunk\ndata: {"pcm":"abc"}')).toEqual({
      event: 'chunk',
      data: '{"pcm":"abc"}',
    });
  });

  it('defaults the event name to "message"', () => {
    expect(parseSseFrame('data: hello')).toEqual({ event: 'message', data: 'hello' });
  });

  it('joins multiple data lines with newlines', () => {
    expect(parseSseFrame('event: x\ndata: one\ndata: two')).toEqual({ event: 'x', data: 'one\ntwo' });
  });

  it('ignores comment and keep-alive lines', () => {
    expect(parseSseFrame(': keep-alive\ndata: payload')).toEqual({ event: 'message', data: 'payload' });
  });

  it('returns null for a frame with no data', () => {
    expect(parseSseFrame('event: ping')).toBeNull();
    expect(parseSseFrame('')).toBeNull();
    expect(parseSseFrame('   ')).toBeNull();
  });

  it('strips exactly one leading space from values', () => {
    expect(parseSseFrame('data:  two-spaces')).toEqual({ event: 'message', data: ' two-spaces' });
  });
});

describe('parseSse', () => {
  it('yields every complete frame', async () => {
    const events = await collect(chunks('event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'));
    expect(events).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('reassembles a frame split across chunk boundaries', async () => {
    const events = await collect(chunks('event: ch', 'unk\ndata: {"pc', 'm":"xyz"}\n', '\n'));
    expect(events).toEqual([{ event: 'chunk', data: '{"pcm":"xyz"}' }]);
  });

  it('handles CRLF line endings', async () => {
    const events = await collect(chunks('event: a\r\ndata: 1\r\n\r\n'));
    expect(events).toEqual([{ event: 'a', data: '1' }]);
  });

  it('handles a CRLF pair split across chunks', async () => {
    const events = await collect(chunks('event: a\r', '\ndata: 1\r\n\r', '\n'));
    expect(events).toEqual([{ event: 'a', data: '1' }]);
  });

  it('emits a trailing frame with no terminating blank line', async () => {
    const events = await collect(chunks('event: a\ndata: 1\n\n', 'event: b\ndata: 2'));
    expect(events).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await collect(chunks())).toEqual([]);
  });
});

describe('sseJson', () => {
  it('parses valid JSON', () => {
    expect(sseJson({ event: 'x', data: '{"a":1}' })).toEqual({ a: 1 });
  });

  it('returns null instead of throwing on malformed JSON', () => {
    expect(sseJson({ event: 'x', data: 'not json' })).toBeNull();
    expect(sseJson({ event: 'x', data: '{"a":' })).toBeNull();
  });
});
