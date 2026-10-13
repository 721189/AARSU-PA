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
  CheckCircle2
} from 'lucide-react';
import { Jarvis3DCore } from './Jarvis3DCore';
import { jarvisAudio } from '../lib/audioEngine';

interface JarvisHudProps {
  token: string | null;
  onVocalize?: (text: string) => void;
  isSpeaking?: boolean;
}

export function JarvisHud({ token, onVocalize, isSpeaking = false }: JarvisHudProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [show3DCore, setShow3DCore] = useState(true);
  const [activeTab, setActiveTab] = useState<'intel' | 'compute' | 'swarm' | 'vault'>('intel');
  
  // Tactical tool states
  const [searchQuery, setSearchQuery] = useState('');
  const [computePrompt, setComputePrompt] = useState('');
  const [swarmObjective, setSwarmObjective] = useState('Full System Diagnostics & Codebase Vulnerability Perimeter Audit');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; sources?: Array<{ title?: string; uri?: string }> } | null>(null);
  const [swarmResult, setSwarmResult] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);

  // Telemetry simulation
  const [arcPower, setArcPower] = useState(100);
  const [telemetryTicks, setTelemetryTicks] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryTicks(t => (t + 1) % 360);
      setArcPower(98 + Math.floor(Math.random() * 3));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
      <div className="absolute top-4 left-4 flex flex-col gap-1 text-[10px] font-mono tracking-wider text-cyan-400 bg-slate-950/75 p-2.5 rounded-xl border border-cyan-500/35 backdrop-blur-md shadow-lg pointer-events-auto">
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
          <span>THE VAULT:</span>
          <span className="text-cyan-300 font-semibold">GRAPH-RAG ACTIVE</span>
        </div>
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
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
        <div className="absolute bottom-4 left-4 right-4 max-w-xl mx-auto bg-slate-950/95 border border-cyan-500/50 rounded-2xl p-4 shadow-[0_0_35px_rgba(6,182,212,0.3)] backdrop-blur-2xl pointer-events-auto flex flex-col gap-3 text-xs animate-in slide-in-from-bottom duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 font-bold text-xs">
                ⚡
              </div>
              <div>
                <h3 className="font-bold text-cyan-300 text-sm tracking-wide">JARVIS Command Center</h3>
                <p className="text-[10px] text-slate-400">Iron Legion Swarm • Graph-RAG Vault • Google Search & Code Exec</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 4-Tab Navigation */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => { setActiveTab('intel'); setResult(null); jarvisAudio.playTacticalChirp(700, 60); }}
              className={`py-1.5 px-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[11px] ${
                activeTab === 'intel'
                  ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3 h-3 text-cyan-400" />
              <span>Search</span>
            </button>

            <button
              onClick={() => { setActiveTab('compute'); setResult(null); jarvisAudio.playTacticalChirp(750, 60); }}
              className={`py-1.5 px-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[11px] ${
                activeTab === 'compute'
                  ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Python</span>
            </button>

            <button
              onClick={() => { setActiveTab('swarm'); jarvisAudio.playTacticalChirp(800, 60); }}
              className={`py-1.5 px-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[11px] ${
                activeTab === 'swarm'
                  ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              <span>Swarm</span>
            </button>

            <button
              onClick={() => { setActiveTab('vault'); fetchKnowledgeVault(); jarvisAudio.playTacticalChirp(850, 60); }}
              className={`py-1.5 px-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-[11px] ${
                activeTab === 'vault'
                  ? 'bg-cyan-600/30 border border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-3 h-3 text-cyan-400" />
              <span>Vault</span>
            </button>
          </div>

          {/* TAB 1: Search Grounding */}
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

          {/* TAB 2: Python Code Exec */}
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

          {/* TAB 3: Iron Legion Swarm */}
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

          {/* TAB 4: Graph-RAG Vault */}
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
