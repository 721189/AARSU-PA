export type Emotion = 'happiness' | 'curiosity' | 'confusion' | 'empathy' | 'excitement' | 'neutral';

export interface SpeechViseme {
  isOpen: boolean;
  openness: number; // 0 (closed) to 1.0 (fully open)
  shape: 'A' | 'O' | 'E' | 'rest';
  currentWord?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'aarsu';
  text: string;
  emotion?: Emotion;
  timestamp: Date;
}

export interface ProactiveSuggestion {
  id: string;
  text: string;
}
