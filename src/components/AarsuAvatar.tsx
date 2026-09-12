import React, { useEffect, useRef, useState } from 'react';
import { Emotion, SpeechViseme, MicroExpression } from '../types';
import aarsuImage from '../assets/images/aarsu_character_1789208513004.jpg';
import { Sparkles, ZoomIn, ZoomOut, Eye } from 'lucide-react';
import { HumanLipSync } from './HumanLipSync';
import { MicroExpressionOverlay } from './MicroExpressionOverlay';

interface AarsuAvatarProps {
  emotion: Emotion;
  isSpeaking?: boolean;
  viseme?: SpeechViseme;
  isVisionActive?: boolean;
  activeMicroExpression?: MicroExpression;
}

export function AarsuAvatar({ 
  emotion, 
  isSpeaking = false, 
  viseme, 
  isVisionActive = false,
  activeMicroExpression
}: AarsuAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Parallax tracking coordinates
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [smoothPos, setSmoothPos] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);

  // Natural Blinking State
  const [isBlinking, setIsBlinking] = useState(false);

  // Autonomous Micro-Expressions System (for natural pauses and lifelike presence)
  const [currentMicroExpression, setCurrentMicroExpression] = useState<MicroExpression>('none');
  const [microIntensity, setMicroIntensity] = useState(0);
  const microTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mouse / Touch Move Listener for 2.5D Parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      setMousePos({
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y))
      });
    };

    const handleMouseLeave = () => {
      setMousePos({ x: 0, y: 0 });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);

  // Smooth exponential interpolation for butter-smooth head & gaze tracking
  useEffect(() => {
    let animId: number;
    const updateSmooth = () => {
      setSmoothPos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.08,
        y: prev.y + (mousePos.y - prev.y) * 0.08
      }));
      animId = requestAnimationFrame(updateSmooth);
    };
    animId = requestAnimationFrame(updateSmooth);
    return () => cancelAnimationFrame(animId);
  }, [mousePos]);

  // Natural Random Blinking Cycle (Every 2.8s - 5s)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
        const nextBlinkTime = 2600 + Math.random() * 2600;
        timeout = setTimeout(triggerBlink, nextBlinkTime);
      }, 160);
    };

    timeout = setTimeout(triggerBlink, 2800);
    return () => clearTimeout(timeout);
  }, []);

  // Sync explicitly passed micro-expression (e.g. from speech pause or user interaction)
  useEffect(() => {
    if (activeMicroExpression && activeMicroExpression !== 'none') {
      setCurrentMicroExpression(activeMicroExpression);
      setMicroIntensity(1);
    }
  }, [activeMicroExpression]);

  // Autonomous Micro-Expressions System: Triggers eye-widening, brow-furrowing, and soft squinting during natural pauses
  useEffect(() => {
    // When speaking constantly, micro-expressions naturally yield to active articulation
    if (isSpeaking) {
      if (currentMicroExpression !== 'none' && !activeMicroExpression) {
        setMicroIntensity(0.3);
        const t = setTimeout(() => {
          setCurrentMicroExpression('none');
          setMicroIntensity(0);
        }, 400);
        return () => clearTimeout(t);
      }
      return;
    }

    // When in a pause between sentences or in idle conversation:
    let isCancelled = false;

    const scheduleNextMicroExpression = () => {
      // Natural conversational pause duration before subtle face micro-movement: 2.5s to 5.5s
      const delay = 2400 + Math.random() * 3200;
      
      microTimerRef.current = setTimeout(() => {
        if (isCancelled) return;

        // Choose appropriate human micro-expression conditioned on current emotional state
        let candidate: MicroExpression = 'none';
        if (emotion === 'curiosity') {
          const options: MicroExpression[] = ['eye_widening', 'brow_raise', 'inquisitive_tilt'];
          candidate = options[Math.floor(Math.random() * options.length)];
        } else if (emotion === 'confusion') {
          const options: MicroExpression[] = ['brow_furrow', 'deep_thought', 'brow_raise'];
          candidate = options[Math.floor(Math.random() * options.length)];
        } else if (emotion === 'happiness' || emotion === 'excitement') {
          const options: MicroExpression[] = ['soft_smile_squint', 'eye_widening', 'warm_crinkle'];
          candidate = options[Math.floor(Math.random() * options.length)];
        } else if (emotion === 'empathy') {
          const options: MicroExpression[] = ['brow_furrow', 'soft_smile_squint', 'warm_crinkle'];
          candidate = options[Math.floor(Math.random() * options.length)];
        } else {
          // Neutral / Thoughtful idle listening
          const options: MicroExpression[] = ['brow_furrow', 'eye_widening', 'brow_raise', 'deep_thought', 'soft_smile_squint'];
          candidate = options[Math.floor(Math.random() * options.length)];
        }

        setCurrentMicroExpression(candidate);
        setMicroIntensity(0.85 + Math.random() * 0.15);

        // Micro-expressions are fleeting in real humans: held for 600ms - 1400ms then smoothly relax
        const duration = 750 + Math.random() * 650;
        setTimeout(() => {
          if (isCancelled) return;
          setMicroIntensity(0);
          setTimeout(() => {
            if (isCancelled) return;
            setCurrentMicroExpression('none');
            scheduleNextMicroExpression();
          }, 350);
        }, duration);

      }, delay);
    };

    scheduleNextMicroExpression();

    return () => {
      isCancelled = true;
      if (microTimerRef.current) clearTimeout(microTimerRef.current);
    };
  }, [isSpeaking, emotion, activeMicroExpression]);

  // Floating Golden Dust Particles Canvas (matching the classroom sunbeam particles in the image)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 900);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle System
    interface Particle {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      opacity: number;
      pulse: number;
      pulseSpeed: number;
    }

    const particleCount = 45;
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.8 + 1.2,
      speedY: -(Math.random() * 0.45 + 0.15),
      speedX: (Math.random() - 0.5) * 0.35,
      opacity: Math.random() * 0.65 + 0.25,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.03 + 0.01
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.pulse += p.pulseSpeed;

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        const currentOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

        // Draw soft glowing golden particle
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
        gradient.addColorStop(0, `rgba(255, 235, 175, ${currentOpacity})`);
        gradient.addColorStop(0.5, `rgba(254, 215, 102, ${currentOpacity * 0.6})`);
        gradient.addColorStop(1, 'rgba(254, 215, 102, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Compute 3D Perspective Gaze & Parallax Tracking
  const getParallaxTransform = () => {
    const rotY = smoothPos.x * 5.5; // Max 5.5 deg left/right gaze tracking
    const rotX = -smoothPos.y * 3.5; // Max 3.5 deg up/down gaze tracking
    return `perspective(1100px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${isZoomed ? 1.45 : 1})`;
  };

  // Compute Subtle Organic Body & Head Pose Changes Based on Emotion State + Micro-Expressions
  const getEmotionPoseTransform = () => {
    let baseTransform = '';
    switch (emotion) {
      case 'curiosity':
        // Attentive forward lean towards the user, inquisitive head tilt, chin lifted
        baseTransform = 'translateY(-10px) translateZ(30px) rotateZ(3.2deg) rotateY(2.2deg) rotateX(2.0deg) scale(1.02)';
        break;
      case 'empathy':
        // Softening of the shoulders, gentle comforting head tilt, downward listening angle
        baseTransform = 'translateY(8px) translateZ(12px) rotateZ(-2.8deg) rotateY(-1.4deg) rotateX(-1.2deg) scale(1.012)';
        break;
      case 'happiness':
        // Buoyant upright posture, cheerful welcoming balance
        baseTransform = 'translateY(-7px) translateZ(16px) rotateZ(1.8deg) rotateY(0.8deg) rotateX(1.0deg) scale(1.024)';
        break;
      case 'excitement':
        // Alert upward lean, energetic forward anticipation
        baseTransform = 'translateY(-16px) translateZ(40px) rotateZ(2.2deg) rotateX(3.0deg) rotateY(1.6deg) scale(1.036)';
        break;
      case 'confusion':
        // Puzzled recoil back, quizzical head cock, slight lateral hesitation
        baseTransform = 'translateY(3px) translateZ(-18px) translateX(-7px) rotateZ(-5.4deg) rotateY(-3.8deg) rotateX(-1.8deg) scale(0.985)';
        break;
      case 'neutral':
      default:
        // Poised, serene upright portrait posture
        baseTransform = 'translateY(0px) translateZ(0px) translateX(0px) rotateZ(0deg) rotateY(0deg) rotateX(0deg) scale(1)';
        break;
    }

    // Layer subtle head micro-nudges when micro-expressions trigger during pauses
    if (currentMicroExpression === 'inquisitive_tilt' || currentMicroExpression === 'brow_raise') {
      return `${baseTransform} rotateZ(${1.5 * microIntensity}deg) translateY(${-3 * microIntensity}px)`;
    }
    if (currentMicroExpression === 'deep_thought' || currentMicroExpression === 'brow_furrow') {
      return `${baseTransform} rotateX(${-1.4 * microIntensity}deg) translateY(${2 * microIntensity}px)`;
    }
    if (currentMicroExpression === 'eye_widening') {
      return `${baseTransform} translateZ(${8 * microIntensity}px) translateY(${-2 * microIntensity}px)`;
    }

    return baseTransform;
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 select-none"
    >
      {/* ================= 1. WARM SUNLIT CLASSROOM AMBIANCE & GODRAYS ================= */}
      {/* Background Soft Classroom Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-amber-950/20 to-amber-900/10 pointer-events-none" />
      
      {/* Sunbeam Light Shaft from Window */}
      <div 
        className="absolute -top-24 -left-20 w-[140%] h-[140%] pointer-events-none opacity-45 mix-blend-screen"
        style={{
          background: 'linear-gradient(135deg, rgba(254, 240, 199, 0.4) 0%, rgba(253, 224, 71, 0.12) 30%, transparent 65%)'
        }}
      />

      {/* ================= 2. LIVING CHARACTER STAGE (AARSU) ================= */}
      {/* Outer Parallax & Zoom Stage */}
      <div 
        className="relative transition-transform duration-200 ease-out will-change-transform flex items-center justify-center"
        style={{
          transform: getParallaxTransform(),
          transformOrigin: isZoomed ? '50% 25%' : '50% 45%'
        }}
      >
        {/* Emotion-Responsive Body & Head Pose Layer (Soft shoulder/torso pivoting) */}
        <div 
          className="relative transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform flex items-center justify-center"
          style={{
            transform: getEmotionPoseTransform(),
            transformOrigin: '50% 65%', // Upper chest & shoulders pivot for natural human postural lean
          }}
        >
          {/* Natural Breathing & Speech Micro-Cadence Wrapper */}
          <div className={`relative ${isSpeaking ? 'animate-speech-nod' : 'animate-subtle-breathe'}`}>
            
            {/* Main High-Resolution Anime Portrait (Matching Reference Image Exactly) */}
            <img 
              src={aarsuImage} 
              alt="Aarsu" 
              referrerPolicy="no-referrer"
              className="max-h-[86vh] md:max-h-[92vh] w-auto object-contain rounded-2xl shadow-2xl pointer-events-none select-none transition-all duration-300"
              style={{
                filter: isSpeaking 
                  ? 'drop-shadow(0 20px 45px rgba(244, 114, 182, 0.18)) brightness(1.02)' 
                  : 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.65))'
              }}
            />

            {/* ================= NATURAL BLINKING OVERLAY ================= */}
            {/* Synchronized over Aarsu's eyes to simulate natural human blinks */}
            {isBlinking && (
              <div 
                className="absolute pointer-events-none transition-opacity duration-75"
                style={{
                  top: '25.6%',
                  left: '42.2%',
                  width: '18.4%',
                  height: '4.8%',
                }}
              >
                {/* Left Eyelid Curved Line */}
                <div 
                  className="absolute left-[3%] top-[30%] w-[38%] h-[3px] rounded-full bg-[#52291d] shadow-sm"
                  style={{ transform: 'rotate(-4deg)' }}
                />
                {/* Right Eyelid Curved Line */}
                <div 
                  className="absolute right-[3%] top-[30%] w-[38%] h-[3px] rounded-full bg-[#52291d] shadow-sm"
                  style={{ transform: 'rotate(4deg)' }}
                />
              </div>
            )}

            {/* ================= PRECISE HUMAN LIP-SYNC COMPONENT ================= */}
            {/* Exact lip alignment (-7.4deg facial slant, anatomically anchored, oral cavity, teeth, tongue, vermilion pad) */}
            <HumanLipSync isSpeaking={isSpeaking} viseme={viseme} />

            {/* ================= DYNAMIC ANATOMICAL MICRO-EXPRESSIONS OVERLAY ================= */}
            {/* Eye-widening pupil highlights, glabellar brow-furrows, asymmetric brow raises, and soft smile squints */}
            <MicroExpressionOverlay 
              expression={currentMicroExpression} 
              intensity={microIntensity} 
            />

            {/* ================= EMOTION-REACTIVE AMBIENT ACCENTS ================= */}
            {/* Rosy Blush Glow during Happiness & Excitement */}
            {(emotion === 'happiness' || emotion === 'excitement') && (
              <div 
                className="absolute pointer-events-none transition-opacity duration-500 opacity-60"
                style={{
                  top: '27.5%',
                  left: '38%',
                  width: '26%',
                  height: '5%',
                  background: 'radial-gradient(ellipse at center, rgba(251, 113, 133, 0.35) 0%, transparent 75%)'
                }}
              />
            )}

            {/* Soft Golden Aura Rim for Speaking Voice */}
            {isSpeaking && (
              <div 
                className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 ring-1 ring-pink-400/20"
                style={{
                  background: 'radial-gradient(circle at 50% 30%, rgba(244, 114, 182, 0.08) 0%, transparent 60%)'
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ================= 3. FLOATING GOLDEN DUST MOTES CANVAS ================= */}
      {/* Sunlit particles floating in the air just like in the reference image */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* ================= 4. SUBTLE STAGE CONTROLS (AWAY FROM HER FACE) ================= */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        {/* Zoom In/Out to focus on her face or desk view */}
        <button
          onClick={() => setIsZoomed(!isZoomed)}
          title={isZoomed ? "Zoom out to full view" : "Zoom in on Aarsu's face"}
          className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md border border-slate-700/60 transition-all shadow-lg text-xs flex items-center gap-1.5"
        >
          {isZoomed ? <ZoomOut className="w-3.5 h-3.5 text-pink-400" /> : <ZoomIn className="w-3.5 h-3.5 text-amber-400" />}
          <span className="hidden sm:inline font-medium text-[11px]">{isZoomed ? 'Full View' : 'Focus Face'}</span>
        </button>

        {/* Emotion & Micro-Expression Indicator Pill (Minimal, non-intrusive) */}
        <div className="px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-300 text-[11px] flex items-center gap-1.5 shadow-lg">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span className="capitalize text-slate-200 font-medium">{emotion}</span>
          {currentMicroExpression !== 'none' && !isSpeaking && (
            <span className="text-[10px] text-amber-300/90 font-normal transition-opacity duration-300">
              • {currentMicroExpression.replace(/_/g, ' ')}
            </span>
          )}
          {isSpeaking && (
            <span className="flex items-center gap-1 text-pink-400 font-medium ml-1">
              • <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping" />
            </span>
          )}
        </div>

        {/* Vision Sight Active Indicator */}
        {isVisionActive && (
          <div className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-1.5 shadow-lg backdrop-blur-md animate-in fade-in duration-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Eye className="w-3 h-3 text-emerald-400" />
            <span className="font-medium text-[10px]">Aarsu is looking</span>
          </div>
        )}
      </div>
    </div>
  );
}
