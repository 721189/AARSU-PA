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
import { ChatMessage, Emotion } from '../types';
import { signInWithGoogle, initAuth, auth } from '../lib/firebase';
import { saveToMemory, retrieveContext } from '../lib/memory';

interface ChatInterfaceProps {
  onEmotionChange: (emotion: Emotion) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  isSpeaking?: boolean;
  emotion?: Emotion;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

type SoftnessPresetKey = 'soft_sweet' | 'gentle_whisper' | 'playful_bright';

interface SoftnessPreset {
  label: string;
  shortLabel: string;
  pitch: number;
  rate: number;
  volume: number;
  description: string;
  icon: string;
}

const SOFTNESS_PRESETS: Record<SoftnessPresetKey, SoftnessPreset> = {
  soft_sweet: {
    label: 'Soft & Sweet Girl',
    shortLabel: 'Soft & Sweet',
    pitch: 1.28,
    rate: 0.92,
    volume: 0.88,
    description: 'Tender, melodic, warm feminine tone',
    icon: '🌸'
  },
  gentle_whisper: {
    label: 'Gentle & Soothing',
    shortLabel: 'Soothing',
    pitch: 1.18,
    rate: 0.88,
    volume: 0.82,
    description: 'Calm, soft, intimate companion pace',
    icon: '🕊️'
  },
  playful_bright: {
    label: 'Playful & Bright',
    shortLabel: 'Playful',
    pitch: 1.34,
    rate: 0.95,
    volume: 0.90,
    description: 'Lively, youthful feminine cadence',
    icon: '✨'
  }
};

export function ChatInterface({ 
  onEmotionChange, 
  onSpeakingChange,
  isSpeaking = false,
  emotion = 'neutral',
  onToggleCollapse
}: ChatInterfaceProps) {
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Voice Controls State
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<SoftnessPresetKey>('soft_sweet');
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showWorkspaceCard, setShowWorkspaceCard] = useState(false);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        user.getIdToken().then(setFirebaseToken);
      },
      () => {
        setFirebaseToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Initialize and prioritize soft female speech synthesis voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices);

          // Auto-select best female voice if none selected yet
          if (!selectedVoiceURI) {
            const bestFemale = findBestFemaleVoice(voices);
            if (bestFemale) {
              setSelectedVoiceURI(bestFemale.voiceURI);
            }
          }
        }
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectedVoiceURI]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loginWorkspace = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setWorkspaceToken(codeResponse.access_token);
      if (firebaseToken) {
        fetchProactiveSuggestions(codeResponse.access_token, firebaseToken);
      }
    },
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

  const fetchProactiveSuggestions = async (wsToken: string, fbToken: string) => {
    try {
      const res = await fetch('/api/proactive', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fbToken}`
        },
        body: JSON.stringify({ token: wsToken }),
      });
      const data = await res.json();
      if (data.suggestions) {
        setProactiveSuggestions(data.suggestions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper: Find softest and highest quality female voice available
  const findBestFemaleVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null;

    // Ordered list of top soft natural feminine voices across Windows, macOS, Android, ChromeOS, iOS
    const topFemalePatterns = [
      /microsoft jenny online/i,
      /microsoft jenny/i,
      /google uk english female/i,
      /microsoft aria online/i,
      /microsoft sonia online/i,
      /samantha/i,
      /victoria/i,
      /google us english female/i,
      /karen/i,
      /tessa/i,
      /serena/i,
      /moira/i,
      /fiona/i,
      /veena/i,
      /microsoft zira/i,
      /female/i,
      /woman/i,
      /girl/i
    ];

    for (const pattern of topFemalePatterns) {
      const match = voices.find(v => pattern.test(v.name));
      if (match) return match;
    }

    // Secondary fallback: Any English voice with female characteristic
    const enFemale = voices.find(v => v.lang.startsWith('en') && /female|natural/i.test(v.name));
    if (enFemale) return enFemale;

    // General English voice
    const enVoice = voices.find(v => v.lang.startsWith('en') && v.default) 
      || voices.find(v => v.lang.startsWith('en'));
    return enVoice || voices[0] || null;
  };

  // Speaks text using the soft girl voice calibration
  const speak = (rawText: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // Cancel any current utterance cleanly
    window.speechSynthesis.cancel();

    // Clean formatting and artifacts for silky-smooth spoken voice
    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[*#_~>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/e\.g\./gi, 'for example')
      .replace(/i\.e\./gi, 'that is')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const preset = SOFTNESS_PRESETS[selectedPreset];

    // Find requested voice or best female voice
    const voices = availableVoices.length > 0 
      ? availableVoices 
      : window.speechSynthesis.getVoices();

    let targetVoice: SpeechSynthesisVoice | null = null;
    if (selectedVoiceURI) {
      targetVoice = voices.find(v => v.voiceURI === selectedVoiceURI) || null;
    }
    if (!targetVoice) {
      targetVoice = findBestFemaleVoice(voices);
    }

    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    // Apply soft feminine acoustics
    utterance.pitch = preset.pitch;
    utterance.rate = preset.rate;
    utterance.volume = preset.volume;

    utterance.onstart = () => {
      onSpeakingChange?.(true);
    };

    utterance.onend = () => {
      onSpeakingChange?.(false);
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis notice:", e);
      onSpeakingChange?.(false);
    };

    window.speechSynthesis.speak(utterance);
  };

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

    try {
      const uid = auth.currentUser?.uid;
      
      let memoryContext = "";
      if (uid) {
        memoryContext = await retrieveContext(uid, text, currentToken);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ message: text, token: workspaceToken, memoryContext })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${res.status}`);
      }

      const data = await res.json();
      
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'aarsu',
        text: data.reply,
        emotion: (data.emotion as Emotion) || 'neutral',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMsg]);
      onEmotionChange((data.emotion as Emotion) || 'neutral');
      speak(data.reply);
      
      if (uid) {
        saveToMemory(uid, `User: ${text} | Aarsu: ${data.reply}`, currentToken);
      }
      
    } catch (err: any) {
      console.error(err);
      onEmotionChange('confusion');
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        sender: 'aarsu', 
        text: `I'm having a slight moment: ${err.message || 'Please check your connection and try again.'}`, 
        emotion: 'confusion', 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error(event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      alert("Speech recognition is not supported in this browser.");
    }
  };

  const testSoftVoice = () => {
    speak("Hello! I am Aarsu. My voice is soft, gentle, and clear now. How can I help you today?");
  };

  // Filter voices that are feminine or English for user selector
  const feminineVoices = availableVoices.filter(v => 
    /female|jenny|aria|sonia|samantha|victoria|karen|tessa|serena|woman|girl/i.test(v.name) ||
    v.lang.startsWith('en')
  );

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
                <h1 className="font-bold text-sm text-white tracking-wide">Aarsu</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-medium border border-pink-500/30 flex items-center gap-1">
                  <Heart className="w-2.5 h-2.5 fill-pink-400 text-pink-400" /> AI Companion
                </span>
                {/* Live Emotion Badge */}
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 capitalize font-normal">
                  {emotion}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>Soft girl voice</span>
                {isSpeaking && (
                  <span className="flex items-center gap-1 text-pink-400 font-medium">
                    • <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping" /> Speaking...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Top Right Action Icons */}
          <div className="flex items-center gap-1">
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
              title="Test soft girl voice sample"
              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-pink-300 hover:text-pink-200 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <Volume2 className="w-3.5 h-3.5" /> Test
            </button>

            {/* Voice Mute Toggle */}
            <button
              onClick={() => {
                if (voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                  onSpeakingChange?.(false);
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

            {/* Browser Voice Selector */}
            {feminineVoices.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Available Voice Model
                </label>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => {
                    setSelectedVoiceURI(e.target.value);
                    setTimeout(() => {
                      speak("Voice changed. I hope you like how soft this sounds.");
                    }, 50);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-pink-500"
                >
                  {feminineVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {/female|jenny|aria|samantha|victoria|girl/i.test(v.name) ? '🌸 ' : '🗣️ '}
                      {v.name} ({v.lang})
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

              {!workspaceToken ? (
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
        {workspaceToken && showWorkspaceCard && proactiveSuggestions.length > 0 && (
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
            <p className="text-sm font-semibold text-slate-200">Talk with Aarsu</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Her face is right beside you on stage. Type or tap the microphone to speak, and she will respond in her soft, gentle girl voice!
            </p>
            <button
              onClick={testSoftVoice}
              className="mt-2 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-pink-300 text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" /> Listen to Aarsu's Voice
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="text-[10px] text-slate-500 mb-1 px-1">
              {msg.sender === 'user' ? 'You' : 'Aarsu'}
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
              <span>Aarsu is thinking softly...</span>
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
          placeholder={firebaseToken ? "Ask Aarsu anything..." : "Sign in to chat with Aarsu..."}
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

    </div>
  );
}
