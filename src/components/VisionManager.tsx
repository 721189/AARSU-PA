import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Eye, EyeOff, Camera, Video, AlertCircle, Check } from 'lucide-react';

export interface VisionManagerHandle {
  captureSnapshot: () => string | null;
  isVisionActive: boolean;
}

interface VisionManagerProps {
  onVisionStatusChange?: (active: boolean) => void;
  className?: string;
}

export const VisionManager = forwardRef<VisionManagerHandle, VisionManagerProps>(({
  onVisionStatusChange,
  className = '',
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Stop camera stream cleanly
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVisionActive(false);
    onVisionStatusChange?.(false);
  };

  // Start camera stream
  const startStream = async () => {
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Webcam access not supported on this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Video play notice:", e));
      }
      setIsVisionActive(true);
      onVisionStatusChange?.(true);
    } catch (err: any) {
      console.warn("Camera start notice:", err);
      let message = "Could not access camera. Please allow camera permissions.";
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        message = "Camera permission was denied. Please allow camera access in your browser settings.";
      }
      setErrorMsg(message);
      setIsVisionActive(false);
      onVisionStatusChange?.(false);
    }
  };

  const toggleVision = () => {
    if (isVisionActive) {
      stopStream();
    } else {
      startStream();
    }
  };

  // Expose imperative methods to parent (e.g., capture snapshot when user asks question)
  useImperativeHandle(ref, () => ({
    isVisionActive,
    captureSnapshot: (): string | null => {
      if (!isVisionActive || !videoRef.current) return null;
      try {
        const video = videoRef.current;
        if (video.videoWidth === 0 || video.videoHeight === 0) return null;

        setIsCapturing(true);
        setTimeout(() => setIsCapturing(false), 300);

        const canvas = document.createElement('canvas');
        // Standardize dimensions for swift multimodal inference (around 640x480 max)
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Quality 0.75 JPEG to keep base64 payload light and fast
        return canvas.toDataURL('image/jpeg', 0.75);
      } catch (err) {
        console.warn("Failed to capture snapshot:", err);
        return null;
      }
    }
  }), [isVisionActive]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Hidden/Offscreen Video Element for Stream Processing */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      {/* Main Vision Toggle Button */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleVision}
          title={isVisionActive ? "Aarsu can see you. Click to close her eyes (Turn off camera)" : "Let Aarsu see you & your room (Turn on camera)"}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm ${
            isVisionActive
              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/10'
              : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700/80'
          }`}
        >
          {isVisionActive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium">Aarsu Can See</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-medium">Let Her See You</span>
            </>
          )}
        </button>

        {/* Small live viewfinder preview toggle when vision is active */}
        {isVisionActive && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Hide camera preview" : "Show what Aarsu sees"}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 text-xs transition-colors"
          >
            <Video className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        )}
      </div>

      {/* Camera Error Pill */}
      {errorMsg && (
        <div className="absolute top-full mt-1.5 right-0 z-50 p-2 rounded-lg bg-rose-950/90 border border-rose-600/50 text-[11px] text-rose-200 shadow-xl max-w-xs flex items-start gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{errorMsg}</span>
            <button 
              onClick={() => setErrorMsg(null)} 
              className="block mt-1 text-[10px] text-rose-400 hover:underline font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Floating Picture-in-Picture Live Preview (What Aarsu sees) */}
      {isVisionActive && showPreview && (
        <div className="absolute top-full mt-2 right-0 z-50 p-1.5 bg-slate-900/95 border border-emerald-500/40 rounded-xl shadow-2xl backdrop-blur-md w-48 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between px-1.5 pb-1 text-[10px] text-slate-400 border-b border-slate-800">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Camera className="w-3 h-3" /> Aarsu's Sight
            </span>
            <button
              onClick={() => setShowPreview(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="relative mt-1 aspect-video rounded-lg overflow-hidden bg-black border border-slate-800">
            {videoRef.current && (
              <canvas
                ref={(c) => {
                  if (c && videoRef.current) {
                    const ctx = c.getContext('2d');
                    let anim: number;
                    const draw = () => {
                      if (videoRef.current && ctx) {
                        ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
                      }
                      anim = requestAnimationFrame(draw);
                    };
                    c.width = 192;
                    c.height = 144;
                    draw();
                    return () => cancelAnimationFrame(anim);
                  }
                }}
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            {/* Shutter flash animation on capture */}
            {isCapturing && (
              <div className="absolute inset-0 bg-white/70 animate-out fade-out duration-300 pointer-events-none" />
            )}
          </div>
          <p className="text-[9px] text-slate-400 text-center mt-1 px-1">
            Looking out into your room
          </p>
        </div>
      )}
    </div>
  );
});
