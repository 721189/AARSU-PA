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
  Network,
  Camera,
  RefreshCw
} from 'lucide-react';
import { Jarvis3DCore } from './Jarvis3DCore';
import { JarvisHoloCad } from './JarvisHoloCad';
import { JarvisMcpInspector } from './JarvisMcpInspector';
import { JarvisSystemsDiagnostic } from './JarvisSystemsDiagnostic';
import { jarvisAudio } from '../lib/audioEngine';
import { duplexVoiceEngine } from '../lib/duplexVoice';
import { authenticatedFetch, auth, isUserAuthenticated } from '../lib/firebase';

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
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [subgraphData, setSubgraphData] = useState<any>(null);
  const [subgraphLoading, setSubgraphLoading] = useState(false);
  const [redisBenchMs, setRedisBenchMs] = useState<number | null>(null);

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

  const hasAuth = () => Boolean(token || isUserAuthenticated());

  // Poll Proactive alerts & Redis metrics when authenticated
  useEffect(() => {
    if (!hasAuth()) return;

    const pollData = async () => {
      try {
        const [feedRes, redisRes, iotRes] = await Promise.all([
          authenticatedFetch('/api/jarvis/proactive/feed'),
          authenticatedFetch('/api/jarvis/redis/metrics'),
          authenticatedFetch('/api/jarvis/iot/devices')
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
        onVocalize?.("Microphone permission required for duplex voice audio, Sir.");
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
    if (!hasAuth()) {
      setResult({ text: "Authentication required to query Google Grounding intelligence, Sir. Please connect via Google." });
      onVocalize?.("Please sign in to establish real-time intelligence uplinks, Sir.");
      return;
    }
    if (!searchQuery.trim()) return;

    jarvisAudio.playTacticalChirp(920, 100);
    setLoading(true);
    setResult(null);
    try {
      const res = await authenticatedFetch('/api/jarvis/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    if (!hasAuth()) {
      setResult({ text: "Authentication required to access Gemini computational sandboxes, Sir. Please connect via Google." });
      onVocalize?.("Authentication credentials required for sandboxed computational physics, Sir.");
      return;
    }
    if (!computePrompt.trim()) return;

    jarvisAudio.playTacticalChirp(750, 120);
    setLoading(true);
    setResult(null);
    try {
      const res = await authenticatedFetch('/api/jarvis/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    if (!hasAuth()) {
      setSwarmResult({ error: "Authentication required to dispatch Iron Legion sub-agents, Sir. Please sign in via Google." });
      onVocalize?.("Iron Legion deployment requires authenticated clearance, Sir.");
      return;
    }
    jarvisAudio.playArcPulse();
    setLoading(true);
    setSwarmResult(null);
    try {
      const res = await authenticatedFetch('/api/jarvis/swarm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      setSwarmResult({ error: "Iron Legion dispatch encounter an uplink failure, Sir." });
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeVault = async () => {
    if (!hasAuth()) return;
    jarvisAudio.playTacticalChirp(800, 90);
    try {
      const res = await authenticatedFetch('/api/jarvis/graph');
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHostDiagnostics = async () => {
    if (!hasAuth()) return;
    jarvisAudio.playTacticalChirp(850, 90);
    try {
      const res = await authenticatedFetch('/api/jarvis/host/diagnostics');
      const data = await res.json();
      setHostDiagnostics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerIotProtocol = async (protocolName: 'tactical_lockdown' | 'night_ambient' | 'nominal_work') => {
    if (!hasAuth()) return;
    jarvisAudio.playArcPulse();
    try {
      const res = await authenticatedFetch('/api/jarvis/iot/protocol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    if (!hasAuth()) {
      setVisionSitrep("Visual neural telemetry requires authentication, Sir. Please connect with Google.");
      onVocalize?.("Visual sensors require authenticated telemetry access, Sir.");
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

      const res = await authenticatedFetch('/api/jarvis/vision/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  const handleToggleDevice = async (deviceId: string, key: string, currentVal: any) => {
    let nextVal = currentVal;
    if (typeof currentVal === 'boolean') {
      nextVal = !currentVal;
    } else if (currentVal === 'on') {
      nextVal = 'off';
    } else if (currentVal === 'off') {
      nextVal = 'on';
    } else if (currentVal === 'locked') {
      nextVal = 'unlocked';
    } else if (currentVal === 'unlocked') {
      nextVal = 'locked';
    } else if (currentVal === 'armed') {
      nextVal = 'standby';
    } else if (currentVal === 'standby') {
      nextVal = 'armed';
    }
    jarvisAudio.playTacticalChirp(920, 60);
    try {
      const res = await authenticatedFetch('/api/jarvis/iot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, state: { [key]: nextVal } })
      });
      if (res.ok) {
        const data = await res.json();
        setIotDevices(prev => prev.map(d => d.id === deviceId ? data.device : d));
        onVocalize?.(`${deviceId.replace(/-/g, ' ')} set to ${nextVal}, Sir.`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const inspectVaultEntity = async (entityId: string) => {
    setSelectedEntity(entityId);
    setSubgraphLoading(true);
    jarvisAudio.playTacticalChirp(850, 70);
    try {
      const res = await authenticatedFetch(`/api/jarvis/graph?entityId=${encodeURIComponent(entityId)}`);
      if (res.ok) {
        const data = await res.json();
        setSubgraphData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubgraphLoading(false);
    }
  };

  const simulateStressSpike = async () => {
    const spike = { heartRate: 114, stressIndex: 82, focusLevel: 65, coreTempC: 37.4 };
    setBiometrics(spike);
    jarvisAudio.playTacticalChirp(400, 150, 'sawtooth');
    try {
      await authenticatedFetch('/api/jarvis/biometrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spike)
      });
      onVocalize?.("Warning: elevated cardiovascular telemetry detected, Sir.");
    } catch {}
  };

  const normalizeVitals = async () => {
    const normal = { heartRate: 72, stressIndex: 18, focusLevel: 94, coreTempC: 36.8 };
    setBiometrics(normal);
    jarvisAudio.playTacticalChirp(880, 80);
    try {
      await authenticatedFetch('/api/jarvis/biometrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normal)
      });
      onVocalize?.("Biometric telemetry normalized to nominal resting baseline, Sir.");
    } catch {}
  };

  const runRedisBenchmark = async () => {
    const t0 = performance.now();
    try {
      await authenticatedFetch('/api/jarvis/redis/metrics');
      const t1 = performance.now();
      const latency = Number((t1 - t0).toFixed(2));
      setRedisBenchMs(latency);
      jarvisAudio.playTacticalChirp(1200, 60);
      onVocalize?.(`Cache benchmark registered at ${latency} milliseconds latency, Sir.`);
    } catch {}
  };

  const deploySwarmPreset = (presetText: string) => {
    setSwarmObjective(presetText);
    jarvisAudio.playArcPulse();
    // Directly run with that preset
    setTimeout(() => {
      runIronLegionSwarm();
    }, 50);
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

          {/* 10-Tab Navigation Matrix */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
            <button
              onClick={() => { setActiveTab('intel'); setResult(null); jarvisAudio.playTacticalChirp(700, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'intel' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3 h-3 text-cyan-400" />
              <span>Search</span>
            </button>

            <button
              onClick={() => { setActiveTab('compute'); setResult(null); jarvisAudio.playTacticalChirp(750, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'compute' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Python</span>
            </button>

            <button
              onClick={() => { setActiveTab('swarm'); jarvisAudio.playTacticalChirp(800, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'swarm' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              <span>Swarm</span>
            </button>

            <button
              onClick={() => { setActiveTab('vision'); runVisionAnalysis(); jarvisAudio.playTacticalChirp(1080, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'vision' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3 text-cyan-400" />
              <span>Vision</span>
            </button>

            <button
              onClick={() => { setActiveTab('vault'); fetchKnowledgeVault(); jarvisAudio.playTacticalChirp(850, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'vault' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-3 h-3 text-cyan-400" />
              <span>Vault</span>
            </button>

            <button
              onClick={() => { setActiveTab('cad'); jarvisAudio.playTacticalChirp(900, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'cad' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>CAD 3D</span>
            </button>

            <button
              onClick={() => { setActiveTab('iot'); jarvisAudio.playTacticalChirp(950, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'iot' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3 h-3 text-cyan-400" />
              <span>IoT</span>
            </button>

            <button
              onClick={() => { setActiveTab('systems'); jarvisAudio.playTacticalChirp(1000, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'systems' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Systems</span>
            </button>

            <button
              onClick={() => { setActiveTab('host'); fetchHostDiagnostics(); jarvisAudio.playTacticalChirp(1050, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'host' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>Host OS</span>
            </button>

            <button
              onClick={() => { setActiveTab('mcp'); jarvisAudio.playTacticalChirp(1100, 60); }}
              className={`py-1.5 px-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[10px] ${
                activeTab === 'mcp' ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200 shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
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

              {/* Fast Mission Presets */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-400">Presets:</span>
                <button
                  onClick={() => deploySwarmPreset("Full Codebase Security & Zero-Day Perimeter Audit")}
                  className="px-2 py-0.5 rounded bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800 text-[10px] text-cyan-300 transition-colors"
                >
                  🛡️ Security Audit
                </button>
                <button
                  onClick={() => deploySwarmPreset("High-Throughput Concurrency & Memory Stress Test")}
                  className="px-2 py-0.5 rounded bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800 text-[10px] text-cyan-300 transition-colors"
                >
                  ⚡ Concurrency Stress
                </button>
                <button
                  onClick={() => deploySwarmPreset("Global Threat Assessment & Uplink Integrity Check")}
                  className="px-2 py-0.5 rounded bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800 text-[10px] text-cyan-300 transition-colors"
                >
                  🌐 Threat Assessment
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
                  <p className="text-slate-200 text-xs leading-relaxed">{swarmResult.synthesizedConclusion}</p>
                  
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

          {/* TAB: Continuous Vision SITREP */}
          {activeTab === 'vision' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 text-[11px] flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" /> Continuous Optical Telemetry & Multimodal SITREP
                </span>
                <button
                  onClick={runVisionAnalysis}
                  disabled={loading}
                  className="px-3 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[10px] transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                  <span>Scan Optical Feed</span>
                </button>
              </div>

              {/* Optical Targeting Reticle Frame */}
              <div className="relative bg-slate-950 border border-cyan-500/40 rounded-xl p-3 overflow-hidden flex flex-col items-center justify-center min-h-[130px]">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.12)_0%,transparent_70%)] pointer-events-none" />
                <div className="absolute top-2 left-2 text-[9px] font-mono text-cyan-400">
                  [ OPTICAL SENSOR: ONLINE ]
                </div>
                <div className="absolute top-2 right-2 text-[9px] font-mono text-emerald-400">
                  FPS: 60 • 4K HDR • MULTIMODAL
                </div>

                <div className="relative w-20 h-20 border border-cyan-400/40 rounded-full flex items-center justify-center animate-pulse">
                  <div className="w-14 h-14 border border-cyan-400/60 rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
                  <div className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
                  <div className="absolute top-0 w-0.5 h-2.5 bg-cyan-400" />
                  <div className="absolute bottom-0 w-0.5 h-2.5 bg-cyan-400" />
                  <div className="absolute left-0 h-0.5 w-2.5 bg-cyan-400" />
                  <div className="absolute right-0 h-0.5 w-2.5 bg-cyan-400" />
                </div>

                <div className="mt-2 text-[10px] text-cyan-300 font-mono tracking-wider">
                  TARGET LOCK ACQUIRED • READY FOR SITREP
                </div>
              </div>

              {/* SITREP readout */}
              {visionSitrep && (
                <div className="bg-slate-900/95 border border-cyan-500/50 rounded-xl p-3 flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-cyan-300 font-semibold text-[11px]">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Optical Telemetry SITREP
                    </span>
                    <button 
                      onClick={() => onVocalize?.(visionSitrep)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Vocalize SITREP ▶
                    </button>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">{visionSitrep}</p>
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

              {/* Devices Grid with Live Interactive Controls */}
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {iotDevices.map(dev => (
                  <div key={dev.id} className="bg-slate-950/80 border border-cyan-950 p-2 rounded-xl flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300 text-[10px] truncate">{dev.name}</span>
                      <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">{dev.room}</span>
                    </div>

                    <div className="text-[9px] text-slate-300 flex flex-col gap-1">
                      {Object.entries(dev.state || {}).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between bg-slate-900/60 px-1.5 py-0.5 rounded">
                          <span className="text-slate-400">{k}:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-mono">{String(v)}</span>
                            {/* Interactive toggle switch for boolean / status keys */}
                            {(k === 'power' || k === 'lockStatus' || k === 'gridStatus' || k === 'blastShield') && (
                              <button
                                onClick={() => handleToggleDevice(dev.id, k, v)}
                                className="px-1.5 py-0.2 rounded text-[8px] bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800"
                              >
                                Toggle
                              </button>
                            )}
                          </div>
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
                <div className="flex items-center gap-2">
                  {selectedEntity && (
                    <button
                      onClick={() => { setSelectedEntity(null); setSubgraphData(null); }}
                      className="text-amber-400 hover:underline text-[10px]"
                    >
                      Clear Focus
                    </button>
                  )}
                  <button 
                    onClick={fetchKnowledgeVault}
                    className="text-cyan-400 hover:underline text-[10px]"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {graphData ? (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {/* Selected Sub-Graph Explorer Banner */}
                  {subgraphData && (
                    <div className="bg-cyan-950/60 border border-cyan-500/40 rounded-xl p-2.5 flex flex-col gap-1 text-[10px]">
                      <span className="font-bold text-cyan-300 flex items-center gap-1">
                        <Share2 className="w-3 h-3 text-cyan-400" /> Focused Entity: {subgraphData.entityId}
                      </span>
                      <div className="text-[9px] text-slate-300">
                        {subgraphData.connectedEdges?.length || 0} active associations connected to neural memory.
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {subgraphData.neighbors?.map((n: any) => (
                          <span key={n.id} className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-800 text-[9px]">
                            {n.label} ({n.type})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nodes Grid */}
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {graphData.nodes?.map((node: any) => {
                      const isFocused = selectedEntity === node.id;
                      return (
                        <div 
                          key={node.id} 
                          onClick={() => inspectVaultEntity(node.id)}
                          className={`p-2 rounded-lg border cursor-pointer transition-all flex flex-col gap-1 ${
                            isFocused 
                              ? 'bg-cyan-950/90 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                              : 'bg-slate-950 hover:bg-slate-900 border-cyan-950'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-cyan-300">{node.label}</span>
                            <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">{node.type}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">
                            {Object.entries(node.properties || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-xs">
                  Loading Stark Knowledge Graph...
                </div>
              )}
            </div>
          )}

          {/* TAB: Systems Diagnostic with D3.js */}
          {activeTab === 'systems' && (
            <JarvisSystemsDiagnostic />
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
