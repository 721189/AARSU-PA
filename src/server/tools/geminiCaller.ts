/**
 * Adapts the Google GenAI SDK to the `ModelCaller` contract used by the tool loop.
 *
 * Kept separate from `toolLoop.ts` so the loop itself stays free of SDK types and
 * can be tested against a scripted fake model.
 */

import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';
import type { ModelCallParams, ModelCaller, ModelTurn, ToolCallRequest } from './types';

export function createGeminiModelCaller(aiClient: GoogleGenAI, model: string = MODELS.chat): ModelCaller {
  return async (params: ModelCallParams): Promise<ModelTurn> => {
    const response = await aiClient.models.generateContent({
      model,
      contents: params.contents as any,
      config: {
        systemInstruction: params.systemInstruction,
        tools: [{ functionDeclarations: params.declarations as any }],
      },
    });

    const parts = (response.candidates?.[0]?.content?.parts ?? []) as any[];

    const text = parts
      .map((part) => part?.text ?? '')
      .join('')
      .trim();

    const toolCalls: ToolCallRequest[] = parts
      .filter((part) => part?.functionCall?.name)
      .map((part) => ({
        ...(part.functionCall.id ? { id: part.functionCall.id } : {}),
        name: part.functionCall.name as string,
        args: (part.functionCall.args ?? {}) as Record<string, any>,
      }));

    return { text, toolCalls };
  };
}
