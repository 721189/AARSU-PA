import React, { useState, useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Mic, Send, Mail, Calendar, HardDrive, FileText, Loader2, PlaySquare, ShieldCheck, ShieldAlert } from 'lucide-react';
import { ChatMessage, Emotion } from '../types';
import { signInWithGoogle, initAuth, auth } from '../lib/firebase';
import { saveToMemory, retrieveContext } from '../lib/memory';

interface ChatInterfaceProps {
  onEmotionChange: (emotion: Emotion) => void;
}

export function ChatInterface({ onEmotionChange }: ChatInterfaceProps) {
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
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

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google UK English Female') || v.name.includes('Samantha'));
      if (femaleVoice) utterance.voice = femaleVoice;
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    }
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
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'aarsu', text: "Access Denied. I cannot process your request without secure authentication. Please click 'Secure Login Required' above.", emotion: 'neutral', timestamp: new Date() }]);
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
        emotion: data.emotion as Emotion,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMsg]);
      onEmotionChange(data.emotion as Emotion);
      speak(data.reply);
      
      if (uid) {
        saveToMemory(uid, `User: ${text} | Aarsu: ${data.reply}`, currentToken);
      }
      
    } catch (err: any) {
      console.error(err);
      onEmotionChange('confusion');
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'aarsu', text: `An error occurred: ${err.message || 'Please check your connection.'}`, emotion: 'confusion', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startListening = () => {
    if (!firebaseToken) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'aarsu', text: "Authentication required. Please click 'Secure Login Required' above to enable voice and text input.", emotion: 'neutral', timestamp: new Date() }]);
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (isListening) return; // Prevent multiple instances
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      
      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        
        setInput(transcript);

        if (event.results[0].isFinal) {
          handleSend(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
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

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4 md:p-8 z-10">
      
      {/* Top Header / Proactive Panel */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl max-w-sm w-full shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            ✨ Aarsu <span className="text-xs font-normal px-2 py-1 bg-indigo-600 rounded-full">Enterprise</span>
          </h2>
          
          <div className="space-y-2 mt-4">
            {!firebaseToken ? (
              <button 
                onClick={handleSecureLogin}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" /> Secure Login Required
              </button>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <ShieldCheck className="w-4 h-4" /> Authenticated via RBAC
              </div>
            )}

            {firebaseToken && !workspaceToken && (
              <button 
                onClick={() => loginWorkspace()}
                className="w-full py-2 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
              >
                <HardDrive className="w-4 h-4" /> Connect Workspace Data
              </button>
            )}

            {workspaceToken && firebaseToken && (
              <div className="space-y-3 border-t border-slate-700 pt-3">
                <div className="flex gap-2 text-slate-400">
                  <Mail className="w-4 h-4" /> <Calendar className="w-4 h-4" /> <FileText className="w-4 h-4" />
                  <span className="text-xs">Workspace Active</span>
                </div>
                {proactiveSuggestions.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">Proactive Insights</p>
                    {proactiveSuggestions.map((sug, i) => (
                      <div key={i} className="text-sm bg-slate-800/50 p-2 rounded border border-slate-700 text-slate-200 cursor-pointer hover:bg-slate-800" onClick={() => handleSend(sug)}>
                        {sug}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="max-w-2xl w-full mx-auto pointer-events-auto">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <PlaySquare className="w-8 h-8 mb-2 opacity-50" />
                Say hello to Aarsu.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2 text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex gap-2">
            <button 
              onClick={startListening}
              className={`p-3 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={firebaseToken ? "Message Aarsu..." : "Login securely to chat..."}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
