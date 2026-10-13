// J.A.R.V.I.S. High-Fidelity Spatial Web Audio & Sound Synthesizer Engine
class JarvisAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private panner: PannerNode | null = null;
  private isInitialized = false;

  private initContext() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;

        if (this.ctx.createPanner) {
          this.panner = this.ctx.createPanner();
          this.panner.panningModel = 'HRTF';
          this.panner.distanceModel = 'inverse';
          this.panner.refDistance = 1;
          this.panner.maxDistance = 10000;
          this.panner.rolloffFactor = 1;
          this.panner.coneInnerAngle = 360;
          this.panner.coneOuterAngle = 0;
          this.panner.coneOuterGain = 0;
          this.panner.positionX.setValueAtTime(0, this.ctx.currentTime);
          this.panner.positionY.setValueAtTime(0, this.ctx.currentTime);
          this.panner.positionZ.setValueAtTime(-1, this.ctx.currentTime);
          this.panner.connect(this.analyser);
        } else {
          // Fallback if panner unsupported
          this.analyser.connect(this.ctx.destination);
        }
        this.analyser.connect(this.ctx.destination);
        this.isInitialized = true;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Synthesize tactical JARVIS Stark HUD beep / affirmative chirp
  public playTacticalChirp(frequency = 880, durationMs = 120, type: OscillatorType = 'sine'): void {
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, this.ctx.currentTime + durationMs / 1000);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationMs / 1000);

      osc.connect(gain);
      if (this.panner) {
        gain.connect(this.panner);
      } else if (this.analyser) {
        gain.connect(this.analyser);
      } else {
        gain.connect(this.ctx.destination);
      }

      osc.start();
      osc.stop(this.ctx.currentTime + durationMs / 1000);
    } catch {
      // Graceful silence if audio permissions blocked
    }
  }

  // Synthesize Arc Reactor power pulse hum
  public playArcPulse(): void {
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch {}
  }

  // Returns live FFT audio frequency spectrum data for the 3D HUD
  public getFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(32);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }
}

export const jarvisAudio = new JarvisAudioEngine();
