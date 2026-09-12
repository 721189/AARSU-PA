export type Emotion = 'happiness' | 'curiosity' | 'confusion' | 'empathy' | 'excitement' | 'neutral';

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
