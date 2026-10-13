import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Terminal, 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  Activity, 
  ExternalLink,
  Loader2,
  X,
  Share2,
  Layers,
  Wrench,
  CheckCircle2,
  Database,
  HeartPulse,
  Eye,
  BellRing,
  Home,
  Mic,
  MicOff,
  Cpu,
  Lock,
  Unlock,
  Sliders,
  Network
} from 'lucide-react';
import { Jarvis3DCore } from './Jarvis3DCore';
import { JarvisHoloCad } from './JarvisHoloCad';
import { JarvisMcpInspector } from './JarvisMcpInspector';
import { jarvisAudio } from '../lib/audioEngine';
import { duplexVoiceEngine } from '../lib/duplexVoice';

interface JarvisHudProps {
  token: string | null;
  onVocalize?: (text: string) => void;
  isSpeaking?: boolean;
}

export function JarvisHud({ token, onVocalize, isSpeaking = false }: JarvisHudProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [show3DCore, setShow3DCore] = useState(true);
  const [activeTab, setActiveTab] = useState<'intel' | 'compute' | 'swarm' | 'vault' | 'systems' | 'vision' | 'iot' | 'cad' | 'host' | 'mcp'>('intel');
  
  // Tactical tool states
  const [searchQuery, setSearchQuery] = useState('');
  const [computePrompt, setComputePrompt] = useState('');
  const [swarmObjective, setSwarmObjective] = useState('Full System Diagnostics & Codebase Vulnerability Perimeter Audit');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; sources?: Array<{ title?: string; uri?: string }> } | null>(null);
  const [swarmResult, setSwarmResult] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);

  // Enterprise Systems Telemetry
  const [redisMetrics, setRedisMetrics] = useState<any>(null);
  const [biometrics, setBiometrics] = useState({ heartRate: 74, stressIndex: 18, focusLevel: 94, coreTempC: 36.8 });
  const [proactiveAlerts, setProactiveAlerts] = useState<any[]>([]);
  const [visionSitrep, setVisionSitrep] = useState<string | null>(null);

  // IoT & Host Systems
  const [iotDevices, setIotDevices] = useState<any[]>([]);
  const [hostDiagnostics, setHostDiagnostics] = useState<any>(null);

  // Duplex Voice Barge-In State
  const [isDuplexActive, setIsDuplexActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  // Telemetry simulation
  const [arcPower, setArcPower] = useState(100);
  const [telemetryTicks, setTelemetryTicks] = useState(0);

  // Keep duplex engine synced with speech status
  useEffect(() => {
    duplexVoiceEngine.setJarvisSpeaking(isSpeaking);
  }, [isSpeaking]);

  // Periodic polling for telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryTicks(t => (t + 1) % 360);
      setArcPower(98 + Math.floor(Math.random() * 3));
      
      setBiometrics(prev => ({
        ...prev,
        heartRate: Math.max(68, Math.min(88, prev.heartRate + (Math.random() > 0.5 ? 1 : -1))),
        stressIndex: Math.max(12, Math.min(32, prev.stressIndex + (Math.random() > 0.5 ? 1 : -1)))
      }));
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // Poll Proactive alerts & Redis metrics when authenticated
  useEffect(() => {
    if (!token) return;

    const pollData = async () => {
      try {
        const [feedRes, redisRes, iotRes] = await Promise.all([
          fetch('/api/jarvis/proactive/feed', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/jarvis/redis/metrics', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/jarvis/iot/devices', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        if (feedRes.ok) {
          const feed = await feedRes.json();
          if (Array.isArray(feed.alerts) && feed.alerts.length > 0) {
            setProactiveAlerts(feed.alerts);
          }
          if (feed.biometrics) {
            setBiometrics(feed.biometrics);
          }
        }
        if (redisRes.ok) {
          const metrics = await redisRes.json();
          setRedisMetrics(metrics);
        }
        if (iotRes.ok) {
          const iotData = await iotRes.json();
          if (Array.isArray(iotData.devices)) {
            setIotDevices(iotData.devices);
          }
        }
      } catch (e) {
        // Silent recovery
      }
    };

    pollData();
    const daemonPoll = setInterval(pollData, 15000);
    return () => clearInterval(daemonPoll);
  }, [token]);

  const toggleDuplexVoice = async () => {
    if (isDuplexActive) {
      duplexVoiceEngine.stopDuplexMonitoring();
      setIsDuplexActive(false);
      jarvisAudio.playTacticalChirp(600, 80);
    } else {
      const ok = await duplexVoiceEngine.startDuplexMonitoring({
        onBargeIn: () => {
          jarvisAudio.playTacticalChirp(1200, 80);
          console.log("[Duplex Voice] Barge-in detected! Interrupted audio playback.");
        },
        onVolumeChange: (vol) => setMicVolume(vol)
      });
      if (ok) {
        setIsDuplexActive(true);
        jarvisAudio.playArcPulse();
        onVocalize?.("Full duplex voice monitoring engaged with active barge-in detection, Sir.");
      } else {
        alert("Please enable microphone permissions in your browser to activate full-duplex voice.");
      }
    }
  };

  const handleOpenToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      jarvisAudio.playArcPulse();
    } else {
      jarvisAudio.playTacticalChirp(600, 80);
    }
  };

  const runGoogleSearch = async () => {
    if (!token) {
      alert("Please authenticate to access Google Search Grounding.");
      return;
    }
    if (!searchQuery.trim()) return;

    jarvisAudio.playTacticalChirp(920, 100);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/jarvis/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await res.json().catch(() => ({}));
      const replyText = typeof data.reply === 'string' && data.reply ? data.reply : (data.error || "Tactical intelligence gathered, Sir.");
      setResult({ text: replyText, sources: Array.isArray(data.sources) ? data.sources : [] });
      if (typeof data.reply === 'string' && data.reply) {
        onVocalize?.(data.reply);
      }
    } catch (e) {
      console.error(e);
      setResult({ text: "Tactical uplink failed, Sir. Please check network telemetry." });
    } finally {
      setLoading(false);
    }
  };

  const runCodeExecution = async () => {
    if (!token) {
      alert("Please authenticate to access Gemini Code Execution.");
      return;
    }
    if (!computePrompt.trim()) return;

    jarvisAudio.playTacticalChirp(750, 120);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/jarvis/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: computePrompt })
      });
      const data = await res.json().catch(() => ({}));
      const replyText = typeof data.reply === 'string' && data.reply ? data.reply : (data.error || "Calculations completed, Sir.");
      setResult({ text: replyText });
      if (typeof data.reply === 'string' && data.reply) {
        onVocalize?.(data.reply);
      }
    } catch (e) {
      console.error(e);
      setResult({ text: "Computational execution error, Sir." });
    } finally {
      setLoading(false);
    }
  };

  const runIronLegionSwarm = async () => {
    if (!token) {
      alert("Please authenticate to dispatch Iron Legion.");
      return;
    }
    jarvisAudio.playArcPulse();
    setLoading(true);
    setSwarmResult(null);
    try {
      const res = await fetch('/api/jarvis/swarm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ objective: swarmObjective })
      });
      const data = await res.json();
      setSwarmResult(data);
      jarvisAudio.playTacticalChirp(1200, 150);
      if (data.synthesizedConclusion) {
        onVocalize?.(data.synthesizedConclusion);
      }
    } catch (e) {
      console.error(e);
      alert("Iron Legion dispatch failed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeVault = async () => {
    if (!token) return;
    jarvisAudio.playTacticalChirp(800, 90);
    try {
      const res = await fetch('/api/jarvis/graph', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHostDiagnostics = async () => {
    if (!token) return;
    jarvisAudio.playTacticalChirp(850, 90);
    try {
      const res = await fetch('/api/jarvis/host/diagnostics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setHostDiagnostics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerIotProtocol = async (protocolName: 'tactical_lockdown' | 'night_ambient' | 'nominal_work') => {
    if (!token) return;
    jarvisAudio.playArcPulse();
    try {
      const res = await fetch('/api/jarvis/iot/protocol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ protocol: protocolName })
      });
      const data = await res.json();
      if (Array.isArray(data.devices)) setIotDevices(data.devices);
      if (data.message) onVocalize?.(data.message);
    } catch (e) {
      console.error(e);
    }
  };

  const runVisionAnalysis = async () => {
    if (!token) {
      alert("Please authenticate to perform visual analysis.");
      return;
    }
    jarvisAudio.playTacticalChirp(1100, 100);
    setLoading(true);
    setVisionSitrep(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 400, 300);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 40, 320, 220);
        ctx.fillStyle = '#22d3ee';
        ctx.font = '16px monospace';
        ctx.fillText('TARGET ACQUIRED: PRIMARY WORKSPACE', 60, 100);
        ctx.fillText('STATUS: SECURE 100%', 60, 130);
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      const res = await fetch('/api/jarvis/vision/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          imageBase64: dataUrl,
          query: "Provide a tactical visual reconnaissance assessment of the current environment and workstation."
        })
      });
      const data = await res.json();
      setVisionSitrep(data.sitrep);
      if (data.sitrep) {
        onVocalize?.(data.sitrep);
      }
    } catch (e) {
      console.error(e);
      setVisionSitrep("Optical telemetry uplink disrupted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      
      {/* ================= 3D HOLOGRAPHIC THREE.JS ARC REACTOR CORE ================= */}
      {show3DCore && (
        <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none">
          <div className="w-[380px] h-[380px] sm:w-[500px] sm:h-[500px]">
            <Jarvis3DCore isSpeaking={isSpeaking} />
          </div>
        </div>
      )}

      {/* 2D Concentric Ambient Radar Dial */}
      <div className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
        <div 
          className="w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] rounded-full border border-cyan-400/40 border-dashed animate-[spin_60s_linear_infinite]"
          style={{ transform: `rotate(${telemetryTicks}deg)` }}
        />
        <div 
          className="absolute w-[280px] h-[280px] sm:w-[410px] sm:h-[410px] rounded-full border border-cyan-500/30 border-t-cyan-400 animate-[spin_25s_linear_infinite_reverse]" 
        />
      </div>

      {/* Top Left HUD Telemetry Gauge */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 text-[10px] font-mono tracking-wider text-cyan-400 bg-slate-950/80 p-2.5 rounded-xl border border-cyan-500/35 backdrop-blur-md shadow-lg pointer-events-auto">
        <div className="flex items-center gap-1.5 font-bold text-cyan-300">
          <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>J.A.R.V.I.S. PROTOCOL</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <span>ARC REACTOR:</span>
          <span className="text-cyan-300 font-semibold">{arcPower}% OPERATIONAL</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <span>IRON LEGION:</span>
          <span className="text-emerald-400 font-semibold">STANDBY (3 AGENTS)</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <span>REDIS CACHE:</span>
          <span className="text-cyan-300 font-semibold">{redisMetrics ? `${redisMetrics.hitRatio} HIT` : '99.4% HIT'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <span>WEARABLE VITALS:</span>
          <span className="text-emerald-400 font-semibold">{biometrics.heartRate} BPM • {biometrics.stressIndex}% STRESS</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <span>DUPLEX BARGE-IN:</span>
          <span className={isDuplexActive ? "text-emerald-400 font-semibold" : "text-slate-500"}>
            {isDuplexActive ? "ACTIVE (MIC ARMED)" : "DISABLED"}
          </span>
        </div>
      </div>

      {/* Top Center Proactive Telemetry Live Ticker */}
      {proactiveAlerts.length > 0 && (
        <div className="hidden lg:flex absolute top-4 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-cyan-500/30 px-3.5 py-1.5 rounded-full backdrop-blur-md text-[10px] text-cyan-300 items-center gap-2 pointer-events-auto shadow-md">
          <BellRing className="w-3 h-3 text-cyan-400 animate-bounce" />
          <span className="font-semibold text-white">SITREP:</span>
          <span className="max-w-md truncate text-slate-200">{proactiveAlerts[0]?.message}</span>
        </div>
      )}

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
        {/* Full Duplex Barge-In Toggle */}
        <button
          onClick={toggleDuplexVoice}
          title={isDuplexActive ? "Duplex Voice Active (Click to mute mic monitoring)" : "Activate Full-Duplex Voice Barge-in"}
          className={`p-1.5 rounded-xl border text-xs transition-all backdrop-blur-md flex items-center gap-1.5 ${
            isDuplexActive 
              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
              : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {isDuplexActive ? <Mic className="w-3.5 h-3.5 animate-pulse text-emerald-400" /> : <MicOff className="w-3.5 h-3.5" />}
          <span className="text-[10px] hidden sm:inline">{isDuplexActive ? "Duplex On" : "Duplex"}</span>
        </button>

        {/* 3D Core Toggle */}
        <button
          onClick={() => setShow3DCore(!show3DCore)}
          title="Toggle 3D Holographic Core"
          className={`p-1.5 rounded-xl border text-xs transition-all backdrop-blur-md ${
            show3DCore 
              ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]' 
              : 'bg-slate-900/80 border-slate-700 text-slate-400'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Command Center Toggle */}
        <button
          onClick={handleOpenToggle}
          className="px-3 py-1.5 rounded-xl bg-cyan-950/85 hover:bg-cyan-900 border border-cyan-400/50 text-cyan-300 text-xs font-semibold flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all backdrop-blur-md"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>{isOpen ? "Close Console" : "Tactical HUD"}</span>
        </button>
      </div>

      {/* ================= TACTICAL SLIDE-OUT CONTROL CONSOLE ================= */}
      {isOpen && (
        <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-slate-950/95 border border-cyan-500/50 rounded-2xl p-4 shadow-[0_0_40px_rgba(6,182,212,0.35)] backdrop-blur-2xl pointer-events-auto flex flex-col gap-3 text-xs animate-in slide-in-from-bottom duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 font-bold text-xs">
                ⚡
              </div>
              <div>
                <h3 className="font-bold text-cyan-300 text-sm tracking-wide">JARVIS Integrated Command Center</h3>
                <p className="text-[10px] text-slate-400">Smart Facility IoT • Holographic CAD • Redis • Swarm • Duplex Engine</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 9-Tab Navigation */}
          <div className="grid grid-cols-3 sm:grid-cols-9 gap-1">
            <button
              onClick={() => { setActiveTab('intel'); setResult(null); jarvisAudio.playTacticalChirp(700, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'intel' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3 h-3 text-cyan-400" />
              <span>Search</span>
            </button>

            <button
              onClick={() => { setActiveTab('compute'); setResult(null); jarvisAudio.playTacticalChirp(750, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'compute' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Python</span>
            </button>

            <button
              onClick={() => { setActiveTab('swarm'); jarvisAudio.playTacticalChirp(800, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'swarm' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              <span>Swarm</span>
            </button>

            <button
              onClick={() => { setActiveTab('vault'); fetchKnowledgeVault(); jarvisAudio.playTacticalChirp(850, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'vault' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-3 h-3 text-cyan-400" />
              <span>Vault</span>
            </button>

            <button
              onClick={() => { setActiveTab('cad'); jarvisAudio.playTacticalChirp(900, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'cad' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>CAD 3D</span>
            </button>

            <button
              onClick={() => { setActiveTab('iot'); jarvisAudio.playTacticalChirp(950, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'iot' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3 h-3 text-cyan-400" />
              <span>IoT</span>
            </button>

            <button
              onClick={() => { setActiveTab('systems'); jarvisAudio.playTacticalChirp(1000, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'systems' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Systems</span>
            </button>

            <button
              onClick={() => { setActiveTab('host'); fetchHostDiagnostics(); jarvisAudio.playTacticalChirp(1050, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'host' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>Host OS</span>
            </button>

            <button
              onClick={() => { setActiveTab('mcp'); jarvisAudio.playTacticalChirp(1100, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'mcp' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Network className="w-3 h-3 text-cyan-400" />
              <span>MCP</span>
            </button>
          </div>

          {/* TAB: Search Grounding */}
          {activeTab === 'intel' && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-slate-300">
                Live Google Search Grounding for real-time worldwide intelligence:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runGoogleSearch()}
                  placeholder="e.g. Current stock of Stark Industries or SpaceX launches..."
                  className="flex-1 bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={runGoogleSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  <span>Scan</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: Python Code Exec */}
          {activeTab === 'compute' && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-slate-300">
                Execute Python algorithms in Google sandbox for verified answers:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={computePrompt}
                  onChange={(e) => setComputePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runCodeExecution()}
                  placeholder="e.g. Simulate projectile trajectory with wind drag..."
                  className="flex-1 bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={runCodeExecution}
                  disabled={loading || !computePrompt.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  <span>Run</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: Iron Legion Swarm */}
          {activeTab === 'swarm' && (
            <div className="flex flex-col gap-2.5">
              <label className="text-[11px] text-slate-300">
                Dispatch autonomous 3-agent swarm (Sentinel, Architect, Tactician) with automated self-healing:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={swarmObjective}
                  onChange={(e) => setSwarmObjective(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runIronLegionSwarm()}
                  placeholder="Mission objective..."
                  className="flex-1 bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={runIronLegionSwarm}
                  disabled={loading || !swarmObjective.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Deploy</span>
                </button>
              </div>

              {swarmResult && (
                <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between text-emerald-400 font-semibold text-[11px]">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mission Concluded in {swarmResult.totalTimeMs}ms
                    </span>
                    {swarmResult.selfHealingTriggered && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                        <Wrench className="w-2.5 h-2.5" /> Self-Healed
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 text-xs">{swarmResult.synthesizedConclusion}</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1">
                    {swarmResult.reports?.map((r: any, idx: number) => (
                      <div key={idx} className="bg-slate-950 p-2 rounded-lg border border-cyan-900/80 flex flex-col gap-1">
                        <span className="font-bold text-cyan-300 text-[10px]">{r.agentName} ({r.executionTimeMs}ms)</span>
                        <div className="flex flex-col gap-0.5 text-[9px] text-slate-300">
                          {r.findings?.map((f: string, fi: number) => (
                            <div key={fi}>• {f}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: 3D Holographic CAD Blueprint */}
          {activeTab === 'cad' && (
            <JarvisHoloCad />
          )}

          {/* TAB: Smart Facility IoT Bridge */}
          {activeTab === 'iot' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 text-[11px] flex items-center gap-1">
                  <Home className="w-3.5 h-3.5 text-cyan-400" /> Malibu Facility Smart IoT Network
                </span>
                {/* Fast Protocol Buttons */}
                <div className="flex gap-1">
                  <button
                    onClick={() => triggerIotProtocol('tactical_lockdown')}
                    className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-300 text-[10px]"
                  >
                    Lockdown
                  </button>
                  <button
                    onClick={() => triggerIotProtocol('night_ambient')}
                    className="px-2 py-0.5 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-500/60 text-sky-300 text-[10px]"
                  >
                    Night
                  </button>
                  <button
                    onClick={() => triggerIotProtocol('nominal_work')}
                    className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 text-[10px]"
                  >
                    Nominal
                  </button>
                </div>
              </div>

              {/* Devices Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {iotDevices.map(dev => (
                  <div key={dev.id} className="bg-slate-950/80 border border-cyan-950 p-2 rounded-xl flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300 text-[10px]">{dev.name}</span>
                      <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">{dev.room}</span>
                    </div>
                    <div className="text-[9px] text-slate-300 flex flex-col gap-0.5">
                      {Object.entries(dev.state || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-slate-500">{k}:</span>
                          <span className="text-slate-300 font-mono">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: Graph-RAG Vault */}
          {activeTab === 'vault' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>The Vault: Associative Neural Knowledge Graph ({graphData?.nodes?.length || 0} nodes, {graphData?.edges?.length || 0} edges)</span>
                <button 
                  onClick={fetchKnowledgeVault}
                  className="text-cyan-400 hover:underline text-[10px]"
                >
                  Refresh
                </button>
              </div>

              {graphData ? (
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {graphData.nodes?.map((node: any) => (
                      <div key={node.id} className="bg-slate-950 p-2 rounded-lg border border-cyan-950 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-300">{node.label}</span>
                          <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">{node.type}</span>
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {Object.entries(node.properties || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-xs">
                  Loading Stark Knowledge Graph...
                </div>
              )}
            </div>
          )}

          {/* TAB: Enterprise Systems & Redis Telemetry */}
          {activeTab === 'systems' && (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950/80 border border-cyan-500/30 p-2.5 rounded-xl flex flex-col gap-1">
                  <span className="font-bold text-cyan-300 text-[11px] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-cyan-400" /> In-Memory Redis Engine
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                    <div>Hit Ratio: <span className="text-emerald-400 font-semibold">{redisMetrics?.hitRatio || '99.4%'}</span></div>
                    <div>Total Keys: <span className="text-cyan-300 font-semibold">{redisMetrics?.totalKeys || '14'}</span></div>
                    <div>Hits: <span className="text-slate-300">{redisMetrics?.hits || '48'}</span></div>
                    <div>Memory: <span className="text-slate-300">{redisMetrics?.memoryEstimatedKb || '12'} KB</span></div>
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-cyan-500/30 p-2.5 rounded-xl flex flex-col gap-1">
                  <span className="font-bold text-emerald-400 text-[11px] flex items-center gap-1.5">
                    <HeartPulse className="w-3.5 h-3.5 text-rose-400 animate-pulse" /> Wearable Biometrics
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                    <div>Heart Rate: <span className="text-emerald-400 font-semibold">{biometrics.heartRate} BPM</span></div>
                    <div>Stress Index: <span className="text-cyan-300 font-semibold">{biometrics.stressIndex}%</span></div>
                    <div>Focus Level: <span className="text-cyan-300 font-semibold">{biometrics.focusLevel}%</span></div>
                    <div>Core Temp: <span className="text-slate-300">{biometrics.coreTempC}°C</span></div>
                  </div>
                </div>
              </div>

              {/* Proactive Daemon Feed */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <BellRing className="w-3 h-3 text-cyan-400" /> Proactive Daemon Intelligence Log
                </span>
                {proactiveAlerts.length > 0 ? (
                  proactiveAlerts.map(alert => (
                    <div key={alert.id} className="text-[10px] text-slate-300 border-l-2 border-cyan-400 pl-2 py-0.5">
                      <div className="font-medium text-cyan-300">{alert.message}</div>
                      <div className="text-[9px] text-slate-400 italic">Action: {alert.actionRecommendation}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-slate-500">Autonomous daemon monitoring system and vitals...</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Host OS Kernel Diagnostics */}
          {activeTab === 'host' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-bold text-cyan-300 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Host OS Kernel & Memory Matrix
                </span>
                <button onClick={fetchHostDiagnostics} className="text-cyan-400 hover:underline text-[10px]">Refresh</button>
              </div>

              {hostDiagnostics ? (
                <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-3 grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-slate-500">Platform:</span> <span className="text-white font-mono">{hostDiagnostics.platform} ({hostDiagnostics.arch})</span></div>
                  <div><span className="text-slate-500">Kernel:</span> <span className="text-white font-mono">{hostDiagnostics.release}</span></div>
                  <div><span className="text-slate-500">CPU Threads:</span> <span className="text-cyan-300 font-mono">{hostDiagnostics.cpus} cores</span></div>
                  <div><span className="text-slate-500">CPU Model:</span> <span className="text-slate-300 truncate font-mono">{hostDiagnostics.cpuModel}</span></div>
                  <div><span className="text-slate-500">Host RAM:</span> <span className="text-emerald-400 font-mono">{hostDiagnostics.freeMemoryMb} MB free / {hostDiagnostics.totalMemoryMb} MB</span></div>
                  <div><span className="text-slate-500">Process Heap:</span> <span className="text-cyan-300 font-mono">{hostDiagnostics.processHeapUsedMb} MB</span></div>
                  <div><span className="text-slate-500">Host Uptime:</span> <span className="text-slate-300 font-mono">{Math.floor(hostDiagnostics.uptimeSeconds / 3600)}h {Math.floor((hostDiagnostics.uptimeSeconds % 3600) / 60)}m</span></div>
                  <div><span className="text-slate-500">Security Ring:</span> <span className="text-emerald-400 font-semibold">{hostDiagnostics.securityKernel}</span></div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-xs">Querying Host OS Kernel Telemetry...</div>
              )}
            </div>
          )}

          {/* TAB: Model Context Protocol (MCP) Server Hub */}
          {activeTab === 'mcp' && (
            <JarvisMcpInspector token={token} />
          )}

          {/* General Result Display (Search / Compute) */}
          {result && (activeTab === 'intel' || activeTab === 'compute') && (
            <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-3 flex flex-col gap-2 max-h-44 overflow-y-auto">
              <div className="flex items-center justify-between text-cyan-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Tactical Intelligence Output
                </span>
                <span className="text-[10px] text-slate-500">{new Date().toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">{result.text}</p>
              
              {result.sources && result.sources.length > 0 && (
                <div className="mt-1 pt-2 border-t border-slate-800 flex flex-col gap-1">
                  <span className="text-[10px] text-cyan-400 font-semibold">Verified Grounding Sources:</span>
                  <div className="flex flex-wrap gap-2">
                    {result.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-300 hover:underline flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-cyan-900"
                      >
                        {s.title || "Source"} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
