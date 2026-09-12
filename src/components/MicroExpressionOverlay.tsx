import React from 'react';
import { MicroExpression } from '../types';

interface MicroExpressionOverlayProps {
  expression: MicroExpression;
  intensity?: number; // 0 to 1
}

export function MicroExpressionOverlay({ expression, intensity = 1 }: MicroExpressionOverlayProps) {
  if (expression === 'none' || intensity <= 0) return null;

  // Eyebrow and Eye dimensions mathematically aligned with portrait:
  // Left brow: centered ~ x: 44.5%, y: 22.8%
  // Right brow: centered ~ x: 55.8%, y: 24.0%
  // Glabella bridge (center): x: 50.2%, y: 24.2%
  // Left eye pupil/specular: x: 43.5%, y: 26.8%
  // Right eye pupil/specular: x: 55.2%, y: 25.7%

  return (
    <div 
      className="absolute inset-0 pointer-events-none transition-opacity duration-300 ease-out"
      style={{ opacity: Math.min(1, intensity) }}
    >
      {/* 1. EYE WIDENING / ALERT INQUISITIVENESS (Pupil dilation & specular iris flash) */}
      {(expression === 'eye_widening' || expression === 'inquisitive_tilt') && (
        <div className="absolute inset-0">
          {/* Left Eye Highlight Sparkle & Widening Lift */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '42.8%',
              top: '25.9%',
              width: '2.4%',
              height: '2.8%',
              background: 'radial-gradient(circle at 45% 45%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.45) 45%, transparent 75%)',
              filter: 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.8))',
              transform: `scale(${1 + 0.25 * intensity})`,
            }}
          />
          {/* Right Eye Highlight Sparkle & Widening Lift */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '54.5%',
              top: '24.9%',
              width: '2.3%',
              height: '2.7%',
              background: 'radial-gradient(circle at 45% 45%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.45) 45%, transparent 75%)',
              filter: 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.8))',
              transform: `scale(${1 + 0.25 * intensity})`,
            }}
          />

          {/* Slight Upper Eyelid Retraction Glow */}
          <div 
            className="absolute rounded-full"
            style={{
              left: '41.5%',
              top: '25.2%',
              width: '4.8%',
              height: '1.2%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(254, 240, 220, 0.35) 50%, transparent 100%)',
              transform: `translateY(${-1.5 * intensity}px)`,
            }}
          />
          <div 
            className="absolute rounded-full"
            style={{
              left: '53.5%',
              top: '24.2%',
              width: '4.8%',
              height: '1.2%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(254, 240, 220, 0.35) 50%, transparent 100%)',
              transform: `translateY(${-1.5 * intensity}px)`,
            }}
          />
        </div>
      )}

      {/* 2. BROW FURROWING (Thoughtful Glabella Crease & Medial Brow Depressor) */}
      {(expression === 'brow_furrow' || expression === 'deep_thought') && (
        <div className="absolute inset-0">
          {/* Subtle Vertical Furrow Shadow Between Brows (Glabellar lines) */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '49.8%',
              top: '23.8%',
              width: '0.9%',
              height: '2.2%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(68, 28, 20, 0.5) 50%, transparent 100%)',
              filter: 'blur(0.8px)',
              transform: `scaleY(${intensity}) scaleX(${intensity})`,
            }}
          />
          {/* Secondary Soft Wrinkle Shading */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '48.9%',
              top: '24.1%',
              width: '0.7%',
              height: '1.6%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(68, 28, 20, 0.35) 50%, transparent 100%)',
              filter: 'blur(0.6px)',
              transform: `rotate(-8deg) scaleY(${intensity})`,
            }}
          />

          {/* Medial Brow Downward Pull Shadow (Depressor Supercilii tension) */}
          {/* Left Inner Brow Pull */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '46.0%',
              top: '23.4%',
              width: '2.6%',
              height: '1.2%',
              background: 'radial-gradient(ellipse at center, rgba(50, 22, 16, 0.45) 0%, transparent 80%)',
              transform: `translateY(${1.5 * intensity}px) rotate(8deg)`,
            }}
          />
          {/* Right Inner Brow Pull */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '52.6%',
              top: '24.2%',
              width: '2.6%',
              height: '1.2%',
              background: 'radial-gradient(ellipse at center, rgba(50, 22, 16, 0.45) 0%, transparent 80%)',
              transform: `translateY(${1.5 * intensity}px) rotate(-8deg)`,
            }}
          />
        </div>
      )}

      {/* 3. ASYMMETRIC BROW RAISE / INQUISITIVE PERK */}
      {expression === 'brow_raise' && (
        <div className="absolute inset-0">
          {/* Right Brow Arched Highlight (Alert Questioning Curiosity) */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '53.6%',
              top: '22.8%',
              width: '4.4%',
              height: '1.3%',
              background: 'linear-gradient(90deg, transparent, rgba(255, 245, 235, 0.45), transparent)',
              transform: `translateY(${-2.2 * intensity}px) rotate(-6deg)`,
            }}
          />
          {/* Arch Accent Shadow */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '54.0%',
              top: '22.2%',
              width: '4.0%',
              height: '0.8%',
              background: 'rgba(52, 24, 18, 0.4)',
              filter: 'blur(0.5px)',
              transform: `translateY(${-2.0 * intensity}px) rotate(-6deg)`,
            }}
          />
        </div>
      )}

      {/* 4. SOFT SMILE SQUINT / WARM EYE CRINKLE (Duchenne marker) */}
      {(expression === 'soft_smile_squint' || expression === 'warm_crinkle') && (
        <div className="absolute inset-0">
          {/* Lower Eyelid Push-Up Cushion (Orbicularis Oculi contraction) */}
          {/* Left Lower Lid */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '42.2%',
              top: '28.0%',
              width: '3.8%',
              height: '1.1%',
              background: 'radial-gradient(ellipse at center, rgba(244, 114, 182, 0.4) 0%, transparent 85%)',
              transform: `translateY(${-1.4 * intensity}px)`,
            }}
          />
          {/* Right Lower Lid */}
          <div 
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: '54.2%',
              top: '26.8%',
              width: '3.8%',
              height: '1.1%',
              background: 'radial-gradient(ellipse at center, rgba(244, 114, 182, 0.4) 0%, transparent 85%)',
              transform: `translateY(${-1.4 * intensity}px)`,
            }}
          />
          {/* Outer Canthal Soft Creases */}
          <div 
            className="absolute rounded-full"
            style={{
              left: '40.6%',
              top: '26.8%',
              width: '1.2%',
              height: '0.8%',
              background: 'rgba(80, 36, 28, 0.3)',
              transform: 'rotate(-15deg)',
            }}
          />
          <div 
            className="absolute rounded-full"
            style={{
              left: '57.8%',
              top: '25.6%',
              width: '1.2%',
              height: '0.8%',
              background: 'rgba(80, 36, 28, 0.3)',
              transform: 'rotate(15deg)',
            }}
          />
        </div>
      )}
    </div>
  );
}
