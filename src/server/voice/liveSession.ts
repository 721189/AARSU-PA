import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';
import { AppError } from '../errors';

/**
 * Ephemeral tokens for the Gemini Live API.
 *
 * The browser must never hold the long-lived `GEMINI_API_KEY`. Instead the
 * server mints a short-lived, single-use token scoped to the Live API, and the
 * client opens the WebSocket session with that.
 *
 * See https://ai.google.dev/gemini-api/docs/live (session management / ephemeral tokens).
 */

export interface LiveTokenResult {
  /** The ephemeral token, used as the API key for the Live session. */
  token: string;
  model: string;
  /** ISO timestamp after which the token cannot be used for new sessions. */
  newSessionExpireTime: string;
  /** ISO timestamp after which the session is closed. */
  expireTime: string;
  uses: number;
  /** WebSocket endpoint the client should connect to. */
  websocketUrl: string;
}

/** Default lifetime of a Live session, in minutes. */
const SESSION_MINUTES = 30;

/** How long the token may be used to *start* a new session, in seconds. */
const NEW_SESSION_WINDOW_SECONDS = 60;

export class LiveSessionService {
  private readonly ai: GoogleGenAI;

  constructor(aiClient: GoogleGenAI) {
    this.ai = aiClient;
  }

  /**
   * Mints a single-use ephemeral token bound to the JARVIS Live configuration.
   *
   * The token locks `responseModalities` and the system instruction so a
   * tampered client cannot repurpose it for arbitrary model access.
   */
  async mintToken(systemInstruction: string): Promise<LiveTokenResult> {
    const now = Date.now();
    const expireTime = new Date(now + SESSION_MINUTES * 60_000).toISOString();
    const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_SECONDS * 1_000).toISOString();

    const authToken = await this.ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveEphemeralParameters: {
          model: MODELS.live,
          config: {
            responseModalities: ['AUDIO'],
            systemInstruction,
          },
        },
      } as any,
    });

    if (!authToken?.name) {
      throw new AppError('upstream_unavailable', 'Live API did not return an ephemeral token.');
    }

    return {
      token: authToken.name,
      model: MODELS.live,
      newSessionExpireTime: authToken.newSessionExpireTime ?? newSessionExpireTime,
      expireTime: authToken.expireTime ?? expireTime,
      uses: authToken.uses ?? 1,
      websocketUrl:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
    };
  }
}
