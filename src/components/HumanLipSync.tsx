import React, { useEffect, useState } from 'react';
import { SpeechViseme } from '../types';

interface HumanLipSyncProps {
  isSpeaking: boolean;
  viseme?: SpeechViseme;
}

export function HumanLipSync({ isSpeaking, viseme }: HumanLipSyncProps) {
  // Smoothly interpolated openness for human-like muscular spring physics
  const [currentOpenness, setCurrentOpenness] = useState(0);
  const [shape, setShape] = useState<'A' | 'O' | 'E' | 'rest'>('rest');

  const targetOpenness = isSpeaking ? Math.max(0.08, viseme?.openness ?? 0.55) : 0;
  const targetShape = isSpeaking ? (viseme?.shape ?? 'A') : 'rest';

  useEffect(() => {
    setShape(targetShape);
  }, [targetShape]);

  useEffect(() => {
    let animId: number;
    const animate = () => {
      setCurrentOpenness(prev => {
        const diff = targetOpenness - prev;
        if (Math.abs(diff) < 0.01) return targetOpenness;
        // Natural speech spring speed
        return prev + diff * 0.38;
      });
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [targetOpenness]);

  const openness = currentOpenness;
  const isVisible = isSpeaking && openness > 0.04;

  // Geometry calculations in 100x50 viewBox
  const leftX = shape === 'O' ? 14 : shape === 'E' ? 5 : 7;
  const rightX = shape === 'O' ? 86 : shape === 'E' ? 95 : 93;
  const midX = 50;

  const upperFlex = Math.min(openness * 1.5, 1.5);
  const jawDrop = openness * 17.5; // realistic human jaw depression
  const upperY = 19 - upperFlex;
  const lowerY = 20 + jawDrop;

  // 1. Oral Cavity Path (Inside of mouth)
  const cavityD = `M ${leftX},20 C ${leftX + 14},${upperY - 0.8} ${midX - 12},${upperY} ${midX},${upperY + 0.8} C ${midX + 12},${upperY} ${rightX - 14},${upperY - 0.8} ${rightX},19 C ${rightX - 10},${lowerY} ${midX + 14},${lowerY + 2.2} ${midX},${lowerY + 2.2} C ${midX - 14},${lowerY + 2.2} ${leftX + 10},${lowerY} ${leftX},20 Z`;

  // 2. Upper Teeth Path (Ivory incisors beneath upper lip)
  const teethD = `M ${leftX + 18},${upperY + 0.6} Q ${midX},${upperY + 1.8} ${rightX - 18},${upperY + 0.6} L ${rightX - 20},${upperY + Math.min(jawDrop * 0.4, 4.4)} Q ${midX},${upperY + Math.min(jawDrop * 0.4, 5.2)} ${leftX + 20},${upperY + Math.min(jawDrop * 0.4, 4.4)} Z`;

  // 3. Tongue Path (Soft pink cushion at bottom of cavity)
  const tongueD = `M ${leftX + 16},${lowerY - 0.4} Q ${midX},${lowerY - Math.min(jawDrop * 0.48, 5.2)} ${rightX - 16},${lowerY - 0.4} Q ${midX},${lowerY + 1.8} ${leftX + 16},${lowerY - 0.4} Z`;

  // 4. Lower Lip Vermilion Pad (Moving downwards with the jaw)
  const lowerLipD = `M ${leftX},20 C ${leftX + 10},${lowerY} ${midX - 14},${lowerY + 2.2} ${midX},${lowerY + 2.2} C ${midX + 14},${lowerY + 2.2} ${rightX - 10},${lowerY} ${rightX},19 C ${rightX - 8},${lowerY + 6.8} ${midX + 14},${lowerY + 7.8} ${midX},${lowerY + 7.8} C ${midX - 14},${lowerY + 7.8} ${leftX + 8},${lowerY + 6.8} ${leftX},20 Z`;

  return (
    <div
      className="absolute pointer-events-none transition-opacity duration-150 ease-out"
      style={{
        top: '35.35%',
        left: '47.55%',
        width: '6.05%',
        height: '2.45%',
        // Exactly aligned with the character's natural lip angle (-7.4 degrees)
        transform: 'rotate(-7.4deg)',
        transformOrigin: '50% 35%',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <svg
        viewBox="0 0 100 50"
        className="w-full h-full overflow-visible"
        style={{ filter: 'drop-shadow(0 1px 1px rgba(70, 15, 20, 0.4))' }}
      >
        <defs>
          {/* Deep oral cavity gradient */}
          <radialGradient id="oralCavityGrad" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#3d1217" />
            <stop offset="70%" stopColor="#25070a" />
            <stop offset="100%" stopColor="#150204" />
          </radialGradient>

          {/* Upper teeth pearl gradient */}
          <linearGradient id="teethGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fdfcf9" stopOpacity="0.96" />
            <stop offset="65%" stopColor="#ece7dd" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#d1c6b5" stopOpacity="0.8" />
          </linearGradient>

          {/* Tongue cushion gradient */}
          <linearGradient id="tongueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e87989" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#be4e5f" stopOpacity="0.98" />
          </linearGradient>

          {/* Lower lip vermilion gradient */}
          <linearGradient id="lowerLipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dc7484" />
            <stop offset="50%" stopColor="#eb8898" />
            <stop offset="100%" stopColor="#c85f70" />
          </linearGradient>
        </defs>

        {/* 1. Deep Oral Cavity */}
        <path
          d={cavityD}
          fill="url(#oralCavityGrad)"
          stroke="#551820"
          strokeWidth="0.8"
        />

        {/* 2. Upper Teeth (Ivory row showing when open) */}
        {jawDrop > 1.8 && (
          <path
            d={teethD}
            fill="url(#teethGrad)"
            stroke="rgba(180, 160, 145, 0.4)"
            strokeWidth="0.4"
          />
        )}

        {/* 3. Tongue (Pink organic shape at bottom of oral cavity) */}
        {jawDrop > 2.5 && (
          <path
            d={tongueD}
            fill="url(#tongueGrad)"
            opacity={Math.min(1, (jawDrop - 2) * 0.4)}
          />
        )}

        {/* 4. Natural Upper Lip Arch Border (Cupid's bow contour) */}
        <path
          d={`M ${leftX},20 C ${leftX + 14},${upperY - 0.8} ${midX - 12},${upperY} ${midX},${upperY + 0.8} C ${midX + 12},${upperY} ${rightX - 14},${upperY - 0.8} ${rightX},19`}
          fill="none"
          stroke="#9e3541"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.95"
        />

        {/* 5. Articulating Lower Lip Vermilion Pad */}
        <path
          d={lowerLipD}
          fill="url(#lowerLipGrad)"
          stroke="#b24756"
          strokeWidth="0.6"
        />

        {/* 6. Lower Lip Gloss Sheen Highlight */}
        {jawDrop > 1.5 && (
          <ellipse
            cx={midX}
            cy={lowerY + 3.8}
            rx={Math.max(6, 16 * (shape === 'O' ? 0.75 : shape === 'E' ? 1.2 : 1.0))}
            ry={1.5}
            fill="#ffe4ea"
            opacity="0.55"
            style={{ filter: 'blur(0.4px)' }}
          />
        )}

        {/* 7. Corner Commissures (Shadow anchors at mouth corners) */}
        <circle cx={leftX} cy="20" r="1.3" fill="#842a32" opacity="0.8" />
        <circle cx={rightX} cy="19" r="1.6" fill="#691a22" opacity="0.95" />
      </svg>
    </div>
  );
}
