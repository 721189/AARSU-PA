import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AarsuAvatar } from './components/AarsuAvatar';
import { ChatInterface } from './components/ChatInterface';
import { JarvisHud } from './components/JarvisHud';
import { Emotion, SpeechViseme, MicroExpression } from './types';
import firebaseConfig from '../firebase-applet-config.json';
import { initAuth } from './lib/firebase';
import { 
  MessageSquare, 
  Zap, 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  Radio,
  Cpu
} from 'lucide-react';

export default function App() {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [microExpression, setMicroExpression] = useState<MicroExpression>('none');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [viseme, setViseme] = useState<SpeechViseme>({ isOpen: false, openness: 0, shape: 'rest' });
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  const clientId = (firebaseConfig as any).oAuthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID || 'dummy-client-id';

  useEffect(() => {
    const timer = setInterval(() => setUptimeSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (_user, token) => {
        setFirebaseToken(token);
      },
      () => {
        setFirebaseToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleVocalize = (text?: string) => {
    if (!text || typeof text !== 'string') return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleaned = text.replace(/[*#_`]/g, '').slice(0, 300).trim();
      if (!cleaned) return;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const formatUptime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="w-full h-screen bg-slate-950 flex flex-col overflow-hidden relative select-none font-sans text-slate-100">
        
        {/* ================= TOP STARK COMMAND HEADER BAR ================= */}
        <header className="h-11 bg-slate-950/95 border-b border-cyan-500/25 px-4 flex items-center justify-between z-30 backdrop-blur-xl shadow-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                <Zap className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
              </div>
              <span className="font-extrabold tracking-wider text-xs sm:text-sm bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 bg-clip-text text-transparent">
                J.A.R.V.I.S.
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                MARK VII
              </span>
            </div>

            {/* Core telemetry badge */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> CORE: 100%
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-300">MCP HUB READY</span>
              <span className="text-slate-600">•</span>
              <span>UPTIME: {formatUptime(uptimeSeconds)}</span>
            </div>
          </div>

          {/* Quick Layout Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChatCollapsed(!chatCollapsed)}
              title={chatCollapsed ? "Open Split Command Dock" : "Maximize Hologram Stage (Focus Mode)"}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                chatCollapsed
                  ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white'
              }`}
            >
              {chatCollapsed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{chatCollapsed ? "Split View" : "Theater Mode"}</span>
            </button>
          </div>
        </header>

        {/* ================= MAIN INTERACTIVE STAGE & WORKSPACE ================= */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          
          {/* LEFT / CENTER: Living Avatar & Holographic 3D Core Stage */}
          <div className={`relative flex-1 h-[45vh] md:h-full flex flex-col transition-all duration-300 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 ${chatCollapsed ? 'w-full' : ''}`}>
            <AarsuAvatar 
              emotion={emotion} 
              isSpeaking={isSpeaking} 
              viseme={viseme}
              isVisionActive={isVisionActive} 
              activeMicroExpression={microExpression}
            />
            {/* Iron Man JARVIS Holographic HUD Layer */}
            <JarvisHud 
              token={firebaseToken} 
              onVocalize={handleVocalize} 
              isSpeaking={isSpeaking} 
            />
          </div>

          {/* RIGHT: Docked Chat, Sub-Agents & Command Interface */}
          <div 
            className={`w-full md:w-[420px] lg:w-[460px] xl:w-[490px] h-[55vh] md:h-full flex-shrink-0 z-20 border-t md:border-t-0 md:border-l border-slate-800/80 bg-slate-900/95 backdrop-blur-2xl transition-all duration-300 shadow-2xl flex flex-col ${
              chatCollapsed ? 'hidden md:hidden' : 'flex'
            }`}
          >
            <ChatInterface 
              onEmotionChange={setEmotion} 
              onSpeakingChange={setIsSpeaking}
              onVisemeChange={setViseme}
              onVisionStatusChange={setIsVisionActive}
              onMicroExpressionChange={setMicroExpression}
              isSpeaking={isSpeaking}
              emotion={emotion}
              isCollapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed(!chatCollapsed)}
            />
          </div>

          {/* Floating Reopen Button when collapsed */}
          {chatCollapsed && (
            <button
              onClick={() => setChatCollapsed(false)}
              title="Open Chat & Dialogue Console"
              className="absolute bottom-5 right-5 z-30 p-3.5 rounded-full bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center animate-bounce"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          )}

        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
