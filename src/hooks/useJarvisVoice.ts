/**
 * React binding for the unified J.A.R.V.I.S. voice engine.
 *
 * Provides one speech path for the whole app: streaming text + Gemini TTS audio,
 * live output level for the avatar's mouth, and microphone barge-in.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { jarvisVoice, type AuthenticatedFetch } from '../lib/jarvisVoice';

export interface UseJarvisVoiceOptions {
  /** Authenticated fetch that injects the Firebase ID token. */
  fetchImpl: AuthenticatedFetch;
  onDelta?: (text: string) => void;
  onSentence?: (text: string) => void;
  onEmotion?: (emotion: string) => void;
  onDone?: (text: string) => void;
  onError?: (error: Error) => void;
  /** Enable microphone barge-in while the assistant speaks. */
  bargeIn?: boolean;
}

export interface UseJarvisVoiceResult {
  /** True while audio is playing. */
  isSpeaking: boolean;
  /** Normalised 0..1 output level, for visemes. */
  level: number;
  /** Send a turn and speak the streamed reply. */
  converse: (input: {
    message: string;
    imageBase64?: string;
    memoryContext?: string;
    persona?: string;
    voice?: string;
  }) => Promise<string>;
  /** Speak arbitrary text without a model turn. */
  speak: (text: string, voice?: string) => Promise<void>;
  /** Interrupt immediately. */
  stop: () => void;
  /** Prime the AudioContext; call from a user gesture. */
  unlock: () => void;
}

export function useJarvisVoice(options: UseJarvisVoiceOptions): UseJarvisVoiceResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);

  // Keep callbacks in a ref so the engine's handlers always see the latest
  // closures without re-subscribing on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const teardownRef = useRef<(() => void) | null>(null);

  // Subscribe to the shared engine so every surface (header, chat dock, HUD)
  // observes the same speech path rather than running its own.
  useEffect(() => {
    return jarvisVoice.on({
      onSpeakingChange: setIsSpeaking,
      onLevel: setLevel,
      onDelta: (text) => optionsRef.current.onDelta?.(text),
      onSentence: (text) => optionsRef.current.onSentence?.(text),
      onEmotion: (emotion) => optionsRef.current.onEmotion?.(emotion),
      onDone: (text) => optionsRef.current.onDone?.(text),
      onError: (error) => optionsRef.current.onError?.(error),
    });
  }, []);

  // Microphone barge-in: when the user starts talking, cut the assistant off.
  useEffect(() => {
    if (!options.bargeIn) return;
    let cancelled = false;

    jarvisVoice
      .monitorForBargeIn(() => {
        if (!cancelled) jarvisVoice.stop();
      })
      .then((teardown) => {
        if (cancelled) teardown();
        else teardownRef.current = teardown;
      })
      .catch(() => {
        // Microphone unavailable or denied; barge-in simply stays off.
      });

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, [options.bargeIn]);

  useEffect(() => {
    return () => {
      jarvisVoice.stop();
    };
  }, []);

  const converse = useCallback<UseJarvisVoiceResult['converse']>(async (input) => {
    return jarvisVoice.converse({
      ...input,
      fetchImpl: optionsRef.current.fetchImpl,
    });
  }, []);

  const speak = useCallback<UseJarvisVoiceResult['speak']>(async (text, voice) => {
    await jarvisVoice.speak(text, optionsRef.current.fetchImpl, voice);
  }, []);

  const stop = useCallback(() => {
    jarvisVoice.stop();
  }, []);

  const unlock = useCallback(() => {
    void jarvisVoice.unlock();
  }, []);

  return { isSpeaking, level, converse, speak, stop, unlock };
}
