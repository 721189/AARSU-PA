// J.A.R.V.I.S. Full-Duplex Audio & Interruption (Barge-In) Detection Engine

export interface DuplexListenerOptions {
  onBargeIn: () => void;
  onVolumeChange?: (volume: number) => void;
  threshold?: number;
}

export class JarvisDuplexVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private isListening = false;
  private isJarvisSpeaking = false;
  private animFrameId: number | null = null;

  public setJarvisSpeaking(speaking: boolean) {
    this.isJarvisSpeaking = speaking;
  }

  public async startDuplexMonitoring(options: DuplexListenerOptions): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      this.isListening = true;
      const threshold = options.threshold || 0.12;
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      let speechConsecutiveFrames = 0;

      const monitorLoop = () => {
        if (!this.isListening || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);

        // Compute RMS volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        options.onVolumeChange?.(avg);

        // Interruption / Barge-In Logic:
        // If JARVIS is speaking and user vocal volume crosses threshold for 3 consecutive frames
        if (this.isJarvisSpeaking && avg > threshold) {
          speechConsecutiveFrames++;
          if (speechConsecutiveFrames >= 3) {
            speechConsecutiveFrames = 0;
            // Instantly cancel speech synthesis
            if (window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            this.isJarvisSpeaking = false;
            options.onBargeIn();
          }
        } else {
          speechConsecutiveFrames = 0;
        }

        this.animFrameId = requestAnimationFrame(monitorLoop);
      };

      monitorLoop();
      return true;
    } catch (err) {
      console.warn("[Duplex Notice] Microphone access deferred or not granted:", err);
      return false;
    }
  }

  public stopDuplexMonitoring() {
    this.isListening = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const duplexVoiceEngine = new JarvisDuplexVoiceEngine();
