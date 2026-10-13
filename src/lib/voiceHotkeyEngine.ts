// J.A.R.V.I.S. Global Hotkey & Advanced Speech-to-Text Pipeline

export interface VoiceHotkeyOptions {
  onCommandRecognized: (transcript: string) => void;
  onWakeWordDetected?: () => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'processing' | 'error') => void;
}

export class JarvisVoiceHotkeyEngine {
  private recognition: any = null;
  private isListening = false;
  private isAlwaysOn = false;
  private options: VoiceHotkeyOptions | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;

  public init(options: VoiceHotkeyOptions) {
    this.options = options;

    // Setup Web Speech API if available
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      try {
        this.recognition = new SpeechRecognitionAPI();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }

          const transcript = (final || interim).trim();
          if (transcript) {
            const lower = transcript.toLowerCase();
            // Check for wake words
            if (lower.includes('jarvis') || lower.includes('aarsu')) {
              this.options?.onWakeWordDetected?.();
            }
            if (final && final.trim().length > 2) {
              this.options?.onCommandRecognized(final.trim());
            }
          }
        };

        this.recognition.onerror = (err: any) => {
          console.warn("[Voice Engine] Speech recognition error:", err);
          this.options?.onStatusChange?.('error');
        };

        this.recognition.onend = () => {
          if (this.isAlwaysOn && this.isListening) {
            try {
              this.recognition?.start();
            } catch (e) {
              // ignore restart errors
            }
          } else {
            this.isListening = false;
            this.options?.onStatusChange?.('idle');
          }
        };
      } catch (e) {
        console.warn("[Voice Engine] Failed to initialize SpeechRecognition:", e);
      }
    }

    // Setup Global Hotkey Listener (Ctrl + Space or Cmd + Space)
    this.boundKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Space or Cmd + Space
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        this.toggleListening();
      }
      // Esc to stop listening
      else if (e.code === 'Escape' && this.isListening) {
        e.preventDefault();
        this.stopListening();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
    }
  }

  public toggleListening(): boolean {
    if (this.isListening) {
      this.stopListening();
      return false;
    } else {
      this.startListening();
      return true;
    }
  }

  public startListening(alwaysOn = false) {
    this.isAlwaysOn = alwaysOn;
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
        this.options?.onStatusChange?.('listening');
      } catch (e) {
        console.warn("[Voice Engine] Start recognition error:", e);
      }
    } else {
      this.isListening = true;
      this.options?.onStatusChange?.('listening');
    }
  }

  public stopListening() {
    this.isAlwaysOn = false;
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    this.options?.onStatusChange?.('idle');
  }

  public destroy() {
    this.stopListening();
    if (typeof window !== 'undefined' && this.boundKeyDown) {
      window.removeEventListener('keydown', this.boundKeyDown);
    }
  }
}

export const voiceHotkeyEngine = new JarvisVoiceHotkeyEngine();
