import React, { useState, useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { 
  Mic, 
  Send, 
  Mail, 
  Calendar, 
  HardDrive, 
  FileText, 
  Loader2, 
  PlaySquare, 
  ShieldCheck, 
  ShieldAlert, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  Heart,
  Headphones,
  Check
} from 'lucide-react';
import { ChatMessage, Emotion, SpeechViseme } from '../types';
import { signInWithGoogle, initAuth, auth, authenticatedFetch, getFreshIdToken } from '../lib/firebase';
import { VisionManager, VisionManagerHandle } from './VisionManager';
import { voiceHotkeyEngine } from '../lib/voiceHotkeyEngine';
import { jarvisVoice } from '../lib/jarvisVoice';
import { jarvisAudio } from '../lib/audioEngine';

interface ChatInterfaceProps {
  onEmotionChange: (emotion: Emotion) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onVisemeChange?: (viseme: SpeechViseme) => void;
  onVisionStatusChange?: (active: boolean) => void;
  onMicroExpressionChange?: (expression: import('../types').MicroExpression) => void;
  isSpeaking?: boolean;
  emotion?: Emotion;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

type SoftnessPresetKey = 'jarvis_classic' | 'tactical' | 'analyst';

interface SoftnessPreset {
  label: string;
  shortLabel: string;
  /** Gemini TTS prebuilt voice name (see src/server/voice/tts.ts). */
  voice: string;
  description: string;
  icon: string;
}

/**
 * Voice presets now map to real Gemini TTS voices. Previously they only nudged
 * `SpeechSynthesisUtterance.pitch`/`rate`, which the browser's robotic voice
 * could barely express and which had no effect at all on the header.
 */
const SOFTNESS_PRESETS: Record<SoftnessPresetKey, SoftnessPreset> = {
  jarvis_classic: {
    label: 'J.A.R.V.I.S. Classic',
    shortLabel: 'Classic',
    voice: 'Charon',
    description: 'Composed, informative, British butler',
    icon: '🛡️'
  },
  tactical: {
    label: 'Tactical',
    shortLabel: 'Tactical',
    voice: 'Orus',
    description: 'Firm and decisive',
    icon: '⚡'
  },
  analyst: {
    label: 'Analyst',
    shortLabel: 'Analyst',
    voice: 'Iapetus',
    description: 'Clear, precise, unhurried',
    icon: '📐'
  }
};

export function ChatInterface({ 
  onEmotionChange, 
  onSpeakingChange,
  onVisemeChange,
  onVisionStatusChange,
  onMicroExpressionChange,
  isSpeaking = false,
  emotion = 'neutral',
  onToggleCollapse
}: ChatInterfaceProps) {
  const [workspaceConnected, setWorkspaceConnected] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVisionActive, setIsVisionActive] = useState(false);
  
  // Voice Controls State
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<SoftnessPresetKey>('jarvis_classic');
  // Gemini TTS voice name (not a browser SpeechSynthesis voiceURI).
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<Array<{ name: string; label: string; style: string }>>([]);
  const [activePersona, setActivePersona] = useState<{ id: string; displayName: string; tagline: string; defaultVoice: string } | null>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showWorkspaceCard, setShowWorkspaceCard] = useState(false);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<string[]>([]);

  // JARVIS Protocol State
  const [showJarvisModal, setShowJarvisModal] = useState(false);
  const [jarvisTask, setJarvisTask] = useState('Codebase Security & Dependency Audit');
  const [jarvisLoading, setJarvisLoading] = useState(false);
  const [jarvisResult, setJarvisResult] = useState<any>(null);
  const [workspaceState, setWorkspaceState] = useState<any>(null);

  const runJarvisAgent = async () => {
    if (!firebaseToken && !auth.currentUser) {
      speak("Please authenticate first to launch autonomous JARVIS agent tasks.");
      return;
    }
    setJarvisLoading(true);
    setJarvisResult(null);
    try {
      const res = await authenticatedFetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskName: jarvisTask, prompt: "Perform deep autonomous analysis of the system architecture and recommend optimal performance improvements." })
      });
      const data = await res.json();
      setJarvisResult(data);
      speak(`Autonomous agent task ${jarvisTask} completed successfully.`);
    } catch (e) {
      console.error(e);
      speak("Autonomous agent execution encountered an error.");
    } finally {
      setJarvisLoading(false);
    }
  };

  const fetchWorkspaceState = async () => {
    try {
      const res = await authenticatedFetch('/api/fs/workspace');
      const data = await res.json();
      setWorkspaceState(data);
    } catch (e) {
      console.error(e);
    }
  };
  
  const personaName = activePersona?.displayName || 'J.A.R.V.I.S.';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const visionRef = useRef<VisionManagerHandle>(null);

  // Stop any in-flight speech when the console unmounts.
  useEffect(() => {
    return () => {
      jarvisVoice.stop();
    };
  }, []);

  // Monitor Firebase Auth State
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

  // Global Hotkey & Speech-to-Text Pipeline Integration
  useEffect(() => {
    voiceHotkeyEngine.init({
      onCommandRecognized: (transcript) => {
        setInput(transcript);
        handleSend(transcript);
      },
      onWakeWordDetected: () => {
        jarvisAudio.playTacticalChirp(900, 100);
        speak("At your service, Sir.");
      },
      onStatusChange: (status) => {
        setIsListening(status === 'listening');
      }
    });

    return () => {
      voiceHotkeyEngine.destroy();
    };
  }, [firebaseToken]);

  // Ask the server whether Workspace is already connected for this account, so a
  // returning user is not shown a "connect" prompt they already satisfied.
  useEffect(() => {
    if (!firebaseToken) {
      setWorkspaceConnected(false);
      return;
    }
    let cancelled = false;
    authenticatedFetch('/api/workspace/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setWorkspaceConnected(Boolean(data.connected));
        if (data.connected) fetchProactiveSuggestions();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseToken]);

  // Load the available Gemini TTS voices from the server, which is the single
  // source of truth. The browser's speechSynthesis voice list is no longer used.
  useEffect(() => {
    if (!firebaseToken) return;
    let cancelled = false;

    authenticatedFetch('/api/voice/voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAvailableVoices(data.voices || []);
        setActivePersona(data.activePersona || null);
        setSelectedVoiceURI((current) => current || data.activePersona?.defaultVoice || '');
      })
      .catch(() => {
        // Voice catalogue is optional; the server default still applies.
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auth-code flow. The browser receives a one-time code which the server
  // exchanges for a refresh token it keeps; no Google access token is ever
  // exposed to the page, so it cannot leak through logs or history.
  const loginWorkspace = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      try {
        const res = await authenticatedFetch('/api/workspace/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.warn('Workspace connect failed:', data.error || res.status);
          setWorkspaceError(data.error || `Workspace connect failed (${res.status})`);
          return;
        }
        setWorkspaceError(null);
        setWorkspaceConnected(true);
        fetchProactiveSuggestions();
      } catch (err: any) {
        console.warn('Workspace connect error:', err);
        setWorkspaceError(err?.message || 'Workspace connect failed.');
      }
    },
    onError: () => setWorkspaceError('Google sign-in was cancelled or denied.'),
    scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents',
  });

  const handleSecureLogin = async () => {
    try {
      const result = await signInWithGoogle();
      if (result) {
        setFirebaseToken(result.accessToken);
      }
    } catch (error) {
      console.error("Firebase Auth Error", error);
    }
  };

  const fetchProactiveSuggestions = async () => {
    try {
      // No token in the body: the server uses the credentials it already holds.
      const res = await authenticatedFetch('/api/proactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'not_connected') setWorkspaceConnected(false);
        return;
      }
      if (data.suggestions) setProactiveSuggestions(data.suggestions);
    } catch (e) {
      console.warn('Proactive suggestions notice:', e);
    }
  };

  // Speaks text using the shared Gemini TTS engine (JARVIS persona by default).
  // Speech is delegated to the shared Gemini TTS engine so the chat dock and the
  // header speak with the same voice (see src/lib/jarvisVoice.ts). The previous
  // implementation ran window.speechSynthesis here with its own pitch/rate
  // hacks, which is why the two surfaces sounded different.
  const speak = (rawText: string) => {
    if (!voiceEnabled) return;

    // Strip formatting that should not be read aloud.
    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*#_~>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/e\.g\./gi, 'for example')
      .replace(/i\.e\./gi, 'that is')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;
    void jarvisVoice.speak(cleanText, authenticatedFetch, SOFTNESS_PRESETS[selectedPreset].voice);
  };

  // Lip-sync is driven by the real output audio envelope instead of a guessed
  // word-to-shape mapping, so the mouth matches the sound actually playing.
  useEffect(() => {
    return jarvisVoice.on({
      onLevel: (level) => {
        if (!level || level <= 0.004) {
          onVisemeChange?.({ isOpen: false, openness: 0, shape: 'rest' });
          return;
        }
        const openness = Math.min(1, level * 3.2);
        onVisemeChange?.({
          isOpen: true,
          openness,
          shape: openness > 0.66 ? 'A' : openness > 0.33 ? 'E' : 'O',
        });
      },
    });
  }, [onVisemeChange]);

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;
    
    let currentToken = firebaseToken;
    if (auth.currentUser) {
      try {
        currentToken = await auth.currentUser.getIdToken();
        setFirebaseToken(currentToken);
      } catch (err) {
        console.warn("Could not refresh token:", err);
      }
    }

    if (!currentToken) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text, timestamp: new Date() }]);
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        sender: 'aarsu', 
        text: "Please sign in with Google above first so I can securely assist you with your personalized context!", 
        emotion: 'neutral', 
        timestamp: new Date() 
      }]);
      setInput('');
      return;
    }
    
    const userMsg: ChatMessage = { id: Date.now().toString(), sender: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Natural conversation pause: the user just finished speaking; pause and ponder.
    onMicroExpressionChange?.('brow_furrow');

    try {
      // Memory retrieval now happens server-side (Phase 3): the server embeds
      // the query, ranks stored memories and injects the profile. The browser no
      // longer downloads the corpus to score it.
      const uid = auth.currentUser?.uid;

      // If vision is active, capture real-time webcam frame of the user/room
      let imageBase64: string | null = null;
      if (visionRef.current?.isVisionActive) {
        imageBase64 = visionRef.current.captureSnapshot();
        if (imageBase64) {
          // Set attentive curiosity emotion right away while analyzing visual input
          onEmotionChange('curiosity');
        }
      }

      const replyId = (Date.now() + 1).toString();

      // Streaming turn: text and speech arrive together, so the reply is spoken
      // from the first completed sentence instead of after the entire answer.
      if (voiceEnabled) {
        setMessages(prev => [...prev, {
          id: replyId,
          sender: 'aarsu',
          text: '',
          emotion: 'neutral',
          timestamp: new Date(),
        }]);

        const fullReply = await jarvisVoice.converse({
          message: text,
          imageBase64: imageBase64 || undefined,
          voice: SOFTNESS_PRESETS[selectedPreset].voice,
          persona: activePersona?.id,
          fetchImpl: authenticatedFetch,
          onDelta: (delta) => {
            setMessages(prev => prev.map(m =>
              m.id === replyId ? { ...m, text: m.text + delta } : m
            ));
          },
          onEmotion: (emotion) => {
            const typed = (emotion as Emotion) || 'neutral';
            onEmotionChange(typed);
            setMessages(prev => prev.map(m =>
              m.id === replyId ? { ...m, emotion: typed } : m
            ));
          },
        });

        if (!fullReply.trim()) {
          throw new Error('The assistant returned an empty reply.');
        }

        onMicroExpressionChange?.('eye_widening');
        setTimeout(() => onMicroExpressionChange?.('none'), 450);

      } else {
        // Muted: fetch the reply as text only.
        const res = await authenticatedFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            imageBase64,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server Error: ${res.status}`);
        }

        const data = await res.json();
        const typedEmotion = (data.emotion as Emotion) || 'neutral';

        setMessages(prev => [...prev, {
          id: replyId,
          sender: 'aarsu',
          text: data.reply,
          emotion: typedEmotion,
          timestamp: new Date(),
        }]);
        onEmotionChange(typedEmotion);

      }
    } catch (err: any) {
      console.warn("Chat interaction notice:", err);
      onEmotionChange('empathy');
      
      let friendlyError = "I could not complete that request, Sir. The details are in the server log.";
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes("503") || msg.includes("high demand") || msg.includes("spikes in demand")) {
        friendlyError = "The model is briefly overloaded, Sir. Try again in a few seconds.";
      } else if (msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota")) {
        friendlyError = "We have hit the API rate limit, Sir. Give it a moment.";
      } else if (err?.message && !err.message.includes("{") && !err.message.includes("ApiError") && !err.message.includes("Server Error: 500")) {
        friendlyError = err.message;
      }

      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        sender: 'aarsu', 
        text: friendlyError, 
        emotion: 'empathy', 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    const active = voiceHotkeyEngine.toggleListening();
    setIsListening(active);
    if (active) {
      jarvisAudio.playArcPulse();
    }
  };

  const testSoftVoice = () => {
    speak(`Good evening, Sir. Voice check complete. ${personaName} is online and ready.`);
  };


  return (
    <div className="h-full flex flex-col justify-between overflow-hidden bg-slate-900/90 text-slate-100">
      
      {/* ================= HEADER & QUICK CONTROLS ================= */}
      <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/95 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-sm text-white tracking-wide">{personaName}</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-medium border border-pink-500/30 flex items-center gap-1">
                  <Heart className="w-2.5 h-2.5 fill-pink-400 text-pink-400" /> AI Companion
                </span>
                {/* Live Emotion Badge */}
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 capitalize font-normal">
                  {emotion}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>Gemini TTS voice</span>
                {isSpeaking && (
                  <span className="flex items-center gap-1 text-pink-400 font-medium">
                    • <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping" /> Speaking...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Top Right Action Icons */}
          <div className="flex items-center gap-1.5">
            {/* Vision Sight Manager (Let the assistant see you) */}
            <VisionManager
              ref={visionRef}
              onVisionStatusChange={(active) => {
                setIsVisionActive(active);
                onVisionStatusChange?.(active);
                if (active) {
                  onEmotionChange('curiosity');
                }
              }}
            />

            {/* JARVIS Protocol & Sub-Agents HUD Toggle */}
            <button
              onClick={() => {
                setShowJarvisModal(true);
                fetchWorkspaceState();
              }}
              title="Activate JARVIS Protocol & Autonomous Agents"
              className="px-2 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> JARVIS Mode
            </button>

            {/* Soft Voice Tuning Toggle */}
            <button
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              title="Configure Voice Softness & Preset"
              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center gap-1.5 ${
                showVoiceSettings 
                  ? 'bg-pink-600/20 border-pink-500/50 text-pink-300' 
                  : 'bg-slate-800/80 hover:bg-slate-750 border-slate-700/80 text-slate-300'
              }`}
            >
              <Headphones className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden sm:inline font-medium text-[11px]">{SOFTNESS_PRESETS[selectedPreset].shortLabel}</span>
            </button>

            {/* Test Voice Quick Button */}
            <button
              onClick={testSoftVoice}
              title="Test the Gemini TTS voice"
              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-pink-300 hover:text-pink-200 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <Volume2 className="w-3.5 h-3.5" /> Test
            </button>

            {/* Voice Mute Toggle */}
            <button
              onClick={() => {
                if (voiceEnabled) {
                  jarvisVoice.stop();
                }
                setVoiceEnabled(!voiceEnabled);
              }}
              title={voiceEnabled ? "Mute Voice Speech" : "Unmute Voice Speech"}
              className={`p-1.5 rounded-lg border transition-colors ${
                voiceEnabled 
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40' 
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Collapse Chat / Focus Face Button */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Focus on Avatar Face (Collapse Chat)"
                className="p-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-750 border-slate-700/80 text-slate-400 hover:text-pink-300 transition-colors hidden md:block"
              >
                <ChevronUp className="w-3.5 h-3.5 rotate-90" />
              </button>
            )}
          </div>
        </div>

        {/* ================= EXPANDABLE VOICE SOFTNESS CONTROLS ================= */}
        {showVoiceSettings && (
          <div className="mt-1 p-3 rounded-xl bg-slate-800/90 border border-pink-500/30 shadow-inner flex flex-col gap-2.5 animate-in fade-in duration-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-pink-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-pink-400" /> Voice Softness & Register
              </span>
              <button
                onClick={testSoftVoice}
                className="text-[11px] text-pink-300 hover:underline flex items-center gap-1"
              >
                Sample Voice ▶
              </button>
            </div>

            {/* Softness Presets */}
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(SOFTNESS_PRESETS) as SoftnessPresetKey[]).map((key) => {
                const preset = SOFTNESS_PRESETS[key];
                const isSelected = selectedPreset === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedPreset(key);
                      setTimeout(() => {
                        speak(`Softness set to ${preset.label}.`);
                      }, 50);
                    }}
                    className={`p-2 rounded-lg border text-left transition-all flex flex-col gap-0.5 ${
                      isSelected 
                        ? 'bg-pink-600/30 border-pink-400 text-white shadow-sm' 
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-medium text-[11px] flex items-center justify-between">
                      <span>{preset.icon} {preset.shortLabel}</span>
                      {isSelected && <Check className="w-3 h-3 text-pink-400" />}
                    </span>
                    <span className="text-[9px] text-slate-400 leading-tight line-clamp-1">{preset.description}</span>
                  </button>
                );
              })}
            </div>

            {/* Gemini TTS Voice Selector */}
            {availableVoices.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Gemini Voice{activePersona ? ` · ${activePersona.displayName}` : ''}
                </label>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedVoiceURI(next);
                    const voice = availableVoices.find(v => v.name === next);
                    setTimeout(() => {
                      speak(`Voice set to ${voice?.label || next}.`);
                    }, 50);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {availableVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.label} — {v.style}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* ================= AUTHENTICATION & WORKSPACE INTEGRATION BAR ================= */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
          {!firebaseToken ? (
            <button 
              onClick={handleSecureLogin}
              className="w-full py-1.5 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 text-xs shadow-sm"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-200" /> Sign In with Google
            </button>
          ) : (
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Connected securely</span>
              </div>

              {workspaceError && (
                <span className="text-[10px] text-rose-300 max-w-[180px] truncate" title={workspaceError}>
                  {workspaceError}
                </span>
              )}

              {!workspaceConnected ? (
                <button 
                  onClick={() => loginWorkspace()}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  <HardDrive className="w-3 h-3 text-indigo-400" /> Connect Google Workspace
                </button>
              ) : (
                <button
                  onClick={() => setShowWorkspaceCard(!showWorkspaceCard)}
                  className="flex items-center gap-1 text-[11px] text-pink-300 hover:text-pink-200"
                >
                  <div className="flex items-center gap-1 text-slate-400">
                    <Mail className="w-3 h-3 text-slate-300" />
                    <Calendar className="w-3 h-3 text-slate-300" />
                    <FileText className="w-3 h-3 text-slate-300" />
                  </div>
                  <span>Workspace Active</span>
                  {showWorkspaceCard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Proactive Workspace Insights Box (if connected) */}
        {workspaceConnected && showWorkspaceCard && proactiveSuggestions.length > 0 && (
          <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-xs space-y-1.5 animate-in fade-in">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-400">Proactive Suggestions</span>
            {proactiveSuggestions.map((sug, i) => (
              <div 
                key={i} 
                onClick={() => handleSend(sug)}
                className="p-1.5 rounded bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300 cursor-pointer text-[11px] transition-colors"
              >
                {sug}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= CHAT MESSAGE STREAM (CLEAR OF THE FACE) ================= */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-pink-400 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Talk with {personaName}</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Her face is right beside you on stage. Type or tap the microphone to speak, and she will respond in her soft, gentle girl voice!
            </p>

            {/* Quick Vision & Sight Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 justify-center mt-2 max-w-xs">
              <button
                onClick={() => handleSend("What color shirt am I wearing?")}
                className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-pink-200 text-[11px] transition-colors"
              >
                👁️ "What color is my shirt?"
              </button>
              <button
                onClick={() => handleSend("What do you see in my room?")}
                className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-pink-200 text-[11px] transition-colors"
              >
                🛋️ "What do you see in my room?"
              </button>
            </div>

            <button
              onClick={testSoftVoice}
              className="mt-2 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-pink-300 text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" /> Hear {personaName}'s voice
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="text-[10px] text-slate-500 mb-1 px-1">
              {msg.sender === 'user' ? 'You' : personaName}
            </div>
            <div 
              className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 flex items-start gap-2 shadow-md ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-slate-800/90 text-slate-100 border border-slate-700/80 rounded-tl-sm'
              }`}
            >
              <div className="flex-1 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {msg.text}
              </div>
              {msg.sender === 'aarsu' && (
                <button
                  onClick={() => speak(msg.text)}
                  title="Replay softly"
                  className="text-slate-400 hover:text-pink-300 transition-colors p-1 rounded flex-shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl px-3.5 py-2 text-pink-300 text-xs flex items-center gap-2 shadow-md">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-400" /> 
              <span>{personaName} is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ================= INPUT & VOICE RECOGNITION BAR ================= */}
      <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2">
        <button 
          onClick={startListening}
          title={isListening ? "Listening to your voice..." : "Voice Input (Speech-to-text)"}
          className={`p-2.5 rounded-full transition-all flex-shrink-0 ${
            isListening 
              ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-500/30' 
              : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={firebaseToken ? `Ask ${personaName} anything...` : `Sign in to chat with ${personaName}...`}
          className="flex-1 bg-slate-800/90 border border-slate-700 rounded-full px-4 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-pink-500/80 transition-colors placeholder:text-slate-500"
        />

        <button 
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
          className="p-2.5 rounded-full bg-pink-600 hover:bg-pink-700 text-white transition-all disabled:opacity-40 disabled:hover:bg-pink-600 shadow-md flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* ================= JARVIS PROTOCOL & SUB-AGENTS MODAL ================= */}
      {showJarvisModal && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-2xl w-full max-w-lg shadow-2xl p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-bold">
                  ⚡
                </div>
                <div>
                  <h2 className="font-bold text-sm text-cyan-300 tracking-wide">JARVIS Protocol & Sub-Agents</h2>
                  <p className="text-[10px] text-slate-400">Autonomous Task Execution & Deep OS Integration</p>
                </div>
              </div>
              <button 
                onClick={() => setShowJarvisModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Workspace Inspector */}
            {workspaceState && (
              <div className="bg-slate-950/60 border border-cyan-500/30 rounded-xl p-3 flex flex-col gap-1.5">
                <span className="font-semibold text-cyan-400 text-[11px] flex items-center gap-1">
                  💻 Workspace OS Diagnostics
                </span>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                  <div><span className="text-slate-500">System:</span> {workspaceState.workspaceName}</div>
                  <div><span className="text-slate-500">Version:</span> {workspaceState.version}</div>
                  <div><span className="text-slate-500">Status:</span> <span className="text-emerald-400 font-medium">{workspaceState.status}</span></div>
                  <div><span className="text-slate-500">Security:</span> {workspaceState.securityLevel}</div>
                </div>
              </div>
            )}

            {/* Autonomous Agent Runner */}
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-slate-300">Select Autonomous Agent Task:</label>
              <select
                value={jarvisTask}
                onChange={(e) => setJarvisTask(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Codebase Security & Dependency Audit">Codebase Security & Dependency Audit</option>
                <option value="Autonomous Performance Optimization">Autonomous Performance Optimization</option>
                <option value="Real-time Knowledge Synthesis & Research">Real-time Knowledge Synthesis & Research</option>
                <option value="System Diagnostics & Memory Garbage Collection">System Diagnostics & Memory Garbage Collection</option>
              </select>

              <button
                onClick={runJarvisAgent}
                disabled={jarvisLoading}
                className="mt-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {jarvisLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {jarvisLoading ? "Executing Autonomous Protocol..." : "Deploy JARVIS Agent Task ⚡"}
              </button>
            </div>

            {/* Execution Result */}
            {jarvisResult && (
              <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-400 text-[11px]">Task Completed Successfully</span>
                  <span className="text-[9px] text-slate-500">{new Date(jarvisResult.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-slate-200 text-[11px]">{jarvisResult.summary}</p>
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Execution Steps:</span>
                  {jarvisResult.steps?.map((step: string, idx: number) => (
                    <div key={idx} className="text-[10px] text-slate-300 flex items-center gap-1.5">
                      <span className="text-cyan-400">✓</span> {step}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
