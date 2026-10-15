/**
 * Real frame capture for the assistant's vision.
 *
 * This replaces the previous HUD "vision analysis", which drew a fake canvas
 * (`TARGET ACQUIRED: PRIMARY WORKSPACE`) and sent *that* to the model instead of
 * ever touching the camera.
 *
 * Owns its own camera and screen streams so any surface can capture a frame
 * without prop-drilling a video element.
 */

/** Largest edge of a captured frame sent to the model. Keeps latency and cost down. */
export const MAX_CAPTURE_WIDTH = 1024;

export interface ScaledDimensions {
  width: number;
  height: number;
}

/**
 * Scales dimensions down so the width fits `maxWidth`, preserving aspect ratio.
 * Never upscales, and never returns a zero dimension.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxWidth: number = MAX_CAPTURE_WIDTH
): ScaledDimensions {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };

  const scale = maxWidth / width;
  return {
    width: Math.round(width * scale),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type CaptureSource = 'screen' | 'camera';

class VisionCapture {
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private cameraVideo: HTMLVideoElement | null = null;
  private screenVideo: HTMLVideoElement | null = null;

  get cameraActive(): boolean {
    return Boolean(this.cameraStream);
  }

  get screenActive(): boolean {
    return Boolean(this.screenStream);
  }

  /** The source that should be preferred for a capture. */
  get preferredSource(): CaptureSource | null {
    if (this.screenActive) return 'screen';
    if (this.cameraActive) return 'camera';
    return null;
  }

  private ensureVideo(element: HTMLVideoElement | null): HTMLVideoElement {
    if (element) return element;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    return video;
  }

  async startCamera(): Promise<boolean> {
    if (this.cameraStream) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      this.cameraVideo = this.ensureVideo(this.cameraVideo);
      this.cameraVideo.srcObject = this.cameraStream;
      await this.cameraVideo.play().catch(() => {});
      return true;
    } catch (err) {
      console.warn('[vision] camera unavailable:', (err as Error)?.message);
      this.cameraStream = null;
      return false;
    }
  }

  stopCamera(): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    if (this.cameraVideo) this.cameraVideo.srcObject = null;
  }

  async startScreen(): Promise<boolean> {
    if (this.screenStream) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return false;

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      this.screenVideo = this.ensureVideo(this.screenVideo);
      this.screenVideo.srcObject = this.screenStream;
      await this.screenVideo.play().catch(() => {});
      return true;
    } catch (err) {
      console.warn('[vision] screen capture unavailable:', (err as Error)?.message);
      this.screenStream = null;
      return false;
    }
  }

  stopScreen(): void {
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    if (this.screenVideo) this.screenVideo.srcObject = null;
  }

  /** Grabs a single JPEG frame from a live video element. */
  private grab(video: HTMLVideoElement | null): string | null {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const { width, height } = computeScaledDimensions(video.videoWidth, video.videoHeight);
    if (width === 0 || height === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  captureCamera(): string | null {
    return this.grab(this.cameraVideo);
  }

  captureScreen(): string | null {
    return this.grab(this.screenVideo);
  }

  /**
   * Captures from whichever source is active, preferring the screen (a shared
   * screen is a deliberate, explicit choice by the user).
   */
  capture(): { dataUrl: string; source: CaptureSource } | null {
    if (this.screenActive) {
      const dataUrl = this.captureScreen();
      if (dataUrl) return { dataUrl, source: 'screen' };
    }
    if (this.cameraActive) {
      const dataUrl = this.captureCamera();
      if (dataUrl) return { dataUrl, source: 'camera' };
    }
    return null;
  }

  stopAll(): void {
    this.stopCamera();
    this.stopScreen();
  }
}

export const visionCapture = new VisionCapture();
