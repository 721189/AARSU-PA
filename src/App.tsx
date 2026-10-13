import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AarsuAvatar } from './components/AarsuAvatar';
import { ChatInterface } from './components/ChatInterface';
import { JarvisHud } from './components/JarvisHud';
import { Emotion, SpeechViseme, MicroExpression } from './types';
import firebaseConfig from '../firebase-applet-config.json';
import { initAuth } from './lib/firebase';
import { MessageSquare } from 'lucide-react';

export default function App() {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [microExpression, setMicroExpression] = useState<MicroExpression>('none');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [viseme, setViseme] = useState<SpeechViseme>({ isOpen: false, openness: 0, shape: 'rest' });
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const clientId = (firebaseConfig as any).oAuthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID || 'dummy-client-id';

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        user.getIdToken().then(setFirebaseToken);
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

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="w-full h-screen bg-slate-950 flex flex-col md:flex-row overflow-hidden relative select-none">
        
        {/* ================= AARSU'S LIVING STAGE (EXACT VISUAL MATCH) ================= */}
        <div className={`relative flex-1 h-[44vh] md:h-full flex flex-col transition-all duration-300 ${chatCollapsed ? 'w-full' : ''}`}>
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

        {/* ================= RIGHT DOCKED CHAT INTERFACE (NO TEXT OVER FACE) ================= */}
        <div 
          className={`w-full md:w-[420px] lg:w-[460px] xl:w-[490px] h-[56vh] md:h-full flex-shrink-0 z-20 border-t md:border-t-0 md:border-l border-slate-800/80 bg-slate-900/95 backdrop-blur-2xl transition-all duration-300 shadow-2xl flex flex-col ${
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

        {/* Reopen Chat Button when collapsed (Positioned in bottom right corner, away from avatar) */}
        {chatCollapsed && (
          <button
            onClick={() => setChatCollapsed(false)}
            title="Open Chat Dock"
            className="absolute bottom-5 right-5 z-30 p-3.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-pink-400 hover:text-white border border-slate-700/80 shadow-2xl transition-all flex items-center justify-center"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}
      </div>
    </GoogleOAuthProvider>
  );
}
