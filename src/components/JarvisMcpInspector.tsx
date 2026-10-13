import React, { useState, useEffect } from 'react';
import { Network, Play, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { jarvisAudio } from '../lib/audioEngine';

interface JarvisMcpInspectorProps {
  token: string | null;
}

export function JarvisMcpInspector({ token }: JarvisMcpInspectorProps) {
  const [tools, setTools] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('google_search_grounding');
  const [toolArgs, setToolArgs] = useState<string>('{\n  "query": "Quantum computing advances"\n}');
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [selectedResource, setSelectedResource] = useState<string>('system://biometrics');
  const [resourceContent, setResourceContent] = useState<any>(null);

  useEffect(() => {
    if (!token) return;

    const fetchMcpMeta = async () => {
      try {
        const [toolsRes, resRes] = await Promise.all([
          fetch('/api/mcp/tools', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/mcp/resources', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        if (toolsRes.ok) {
          const t = await toolsRes.json();
          setTools(t.tools || []);
        }
        if (resRes.ok) {
          const r = await resRes.json();
          setResources(r.resources || []);
        }
      } catch (e) {
        console.error("MCP fetch error:", e);
      }
    };

    fetchMcpMeta();
  }, [token]);

  // Set default sample arguments when tool selection changes
  const handleSelectTool = (name: string) => {
    setSelectedTool(name);
    jarvisAudio.playTacticalChirp(750, 50);
    setExecutionResult(null);

    if (name === 'google_search_grounding') {
      setToolArgs('{\n  "query": "Stark Industries clean energy innovations"\n}');
    } else if (name === 'python_code_execution') {
      setToolArgs('{\n  "prompt": "Compute escape velocity from Earth in km/s using standard G and M constants"\n}');
    } else if (name === 'iron_legion_swarm') {
      setToolArgs('{\n  "objective": "Verify perimeter security and code vulnerabilities"\n}');
    } else if (name === 'knowledge_graph_query') {
      setToolArgs('{\n  "entityId": "arc-reactor"\n}');
    } else if (name === 'iot_facility_control') {
      setToolArgs('{\n  "protocol": "tactical_lockdown"\n}');
    } else {
      setToolArgs('{}');
    }
  };

  const executeTool = async () => {
    if (!token) return;
    jarvisAudio.playTacticalChirp(900, 80);
    setLoading(true);
    setExecutionResult(null);

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(toolArgs);
      } catch {
        alert("Invalid JSON format in tool arguments");
        setLoading(false);
        return;
      }

      const res = await fetch('/api/mcp/tools/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: selectedTool, arguments: parsed })
      });
      const data = await res.json();
      setExecutionResult(data);
      jarvisAudio.playTacticalChirp(1150, 100);
    } catch (e: any) {
      setExecutionResult({ error: e.message || "Failed to execute MCP tool" });
    } finally {
      setLoading(false);
    }
  };

  const readResource = async (uri: string) => {
    if (!token) return;
    jarvisAudio.playTacticalChirp(820, 60);
    setSelectedResource(uri);
    setResourceContent(null);

    try {
      const res = await fetch('/api/mcp/resources/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uri })
      });
      const data = await res.json();
      setResourceContent(data);
    } catch (e: any) {
      setResourceContent({ error: e.message });
    }
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2">
        <span className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
          <Network className="w-3.5 h-3.5 text-cyan-400" /> Model Context Protocol (MCP) Server Hub
        </span>
        <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
          MCP SPEC 2024-11-05 READY
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Tool Invoker Column */}
        <div className="flex flex-col gap-2 bg-slate-950/80 border border-cyan-950 p-2.5 rounded-xl">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Registered MCP Tools ({tools.length})
          </label>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {tools.map(tool => (
              <button
                key={tool.name}
                onClick={() => handleSelectTool(tool.name)}
                className={`text-[9px] px-2 py-1 rounded border transition-all ${
                  selectedTool === tool.name 
                    ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200 font-semibold' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tool.name}
              </button>
            ))}
          </div>

          <label className="text-[10px] text-slate-300 mt-1">Tool Input Arguments (JSON):</label>
          <textarea
            value={toolArgs}
            onChange={(e) => setToolArgs(e.target.value)}
            rows={4}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-cyan-200 focus:outline-none focus:border-cyan-400"
          />

          <button
            onClick={executeTool}
            disabled={loading}
            className="py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-1.5 transition-all shadow disabled:opacity-50 text-[11px]"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
            <span>Invoke MCP Tool</span>
          </button>
        </div>

        {/* Resources & Output Column */}
        <div className="flex flex-col gap-2 bg-slate-950/80 border border-cyan-950 p-2.5 rounded-xl">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Exposed MCP Resources ({resources.length})
          </label>
          <div className="flex flex-wrap gap-1">
            {resources.map(res => (
              <button
                key={res.uri}
                onClick={() => readResource(res.uri)}
                className={`text-[9px] px-2 py-1 rounded border transition-all ${
                  selectedResource === res.uri 
                    ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-semibold' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {res.name}
              </button>
            ))}
          </div>

          <label className="text-[10px] text-slate-300 mt-1">Protocol Execution Output:</label>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-slate-200 max-h-36 overflow-y-auto whitespace-pre-wrap">
            {executionResult ? (
              JSON.stringify(executionResult, null, 2)
            ) : resourceContent ? (
              JSON.stringify(resourceContent, null, 2)
            ) : (
              <span className="text-slate-500">Ready to execute MCP tool or read resource...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
