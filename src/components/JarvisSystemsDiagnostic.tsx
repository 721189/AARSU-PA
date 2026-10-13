import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Cpu, HardDrive, Wifi, Activity, ShieldAlert, Play, Pause, RefreshCw } from 'lucide-react';
import { jarvisAudio } from '../lib/audioEngine';

interface MetricPoint {
  time: number;
  cpu: number;
  memory: number;
  latency: number;
}

export function JarvisSystemsDiagnostic() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dataPoints, setDataPoints] = useState<MetricPoint[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'all' | 'cpu' | 'memory' | 'latency'>('all');
  const [anomalyMode, setAnomalyMode] = useState(false);

  // Initialize data history
  useEffect(() => {
    const initial: MetricPoint[] = [];
    const now = Date.now();
    for (let i = 30; i >= 0; i--) {
      initial.push({
        time: now - i * 1000,
        cpu: 18 + Math.random() * 12,
        memory: 42 + Math.random() * 6,
        latency: 12 + Math.random() * 8
      });
    }
    setDataPoints(initial);
  }, []);

  // Live simulation tick
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setDataPoints(prev => {
        const baseCpu = anomalyMode ? 75 + Math.random() * 20 : 20 + Math.random() * 15;
        const baseMem = anomalyMode ? 85 + Math.random() * 10 : 44 + Math.random() * 5;
        const baseLat = anomalyMode ? 140 + Math.random() * 80 : 10 + Math.random() * 12;

        const nextPoint: MetricPoint = {
          time: Date.now(),
          cpu: Math.min(100, Math.max(5, baseCpu)),
          memory: Math.min(100, Math.max(10, baseMem)),
          latency: Math.max(2, baseLat)
        };
        const next = [...prev.slice(1), nextPoint];
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, anomalyMode]);

  // Render D3 chart
  useEffect(() => {
    if (!svgRef.current || dataPoints.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 560;
    const height = 220;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(dataPoints, d => d.time) as [number, number])
      .range([0, innerWidth]);

    const yMax = activeMetric === 'latency' ? 300 : 100;
    const y = d3.scaleLinear()
      .domain([0, yMax])
      .range([innerHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('stroke', '#1e293b')
      .attr('stroke-dasharray', '2,2')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => ''));

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%H:%M:%S')(new Date(Number(d)))))
      .attr('color', '#64748b')
      .style('font-size', '9px')
      .style('font-family', 'monospace');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .attr('color', '#64748b')
      .style('font-size', '9px')
      .style('font-family', 'monospace');

    // Lines & Areas
    if (activeMetric === 'all' || activeMetric === 'cpu') {
      const cpuLine = d3.line<MetricPoint>()
        .x(d => x(d.time))
        .y(d => y(d.cpu))
        .curve(d3.curveMonotoneX);

      const cpuArea = d3.area<MetricPoint>()
        .x(d => x(d.time))
        .y0(innerHeight)
        .y1(d => y(d.cpu))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(dataPoints)
        .attr('fill', 'rgba(6, 182, 212, 0.1)')
        .attr('d', cpuArea);

      g.append('path')
        .datum(dataPoints)
        .attr('fill', 'none')
        .attr('stroke', '#06b6d4')
        .attr('stroke-width', 2)
        .attr('d', cpuLine);
    }

    if (activeMetric === 'all' || activeMetric === 'memory') {
      const memLine = d3.line<MetricPoint>()
        .x(d => x(d.time))
        .y(d => y(d.memory))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(dataPoints)
        .attr('fill', 'none')
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2)
        .attr('d', memLine);
    }

    if (activeMetric === 'all' || activeMetric === 'latency') {
      const latLine = d3.line<MetricPoint>()
        .x(d => x(d.time))
        .y(d => y(d.latency))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(dataPoints)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2')
        .attr('d', latLine);
    }

  }, [dataPoints, activeMetric]);

  const latest = dataPoints[dataPoints.length - 1] || { cpu: 0, memory: 0, latency: 0 };

  return (
    <div className="flex flex-col gap-3">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-bold text-cyan-300 text-xs">J.A.R.V.I.S. Systems Diagnostic & Performance Telemetry</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setAnomalyMode(!anomalyMode); jarvisAudio.playTacticalChirp(600, 100); }}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all ${
              anomalyMode ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse' : 'bg-slate-900 border-slate-700 text-slate-300'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{anomalyMode ? "Anomaly Active" : "Simulate Stress"}</span>
          </button>
          <button
            onClick={() => { setIsPaused(!isPaused); jarvisAudio.playTacticalChirp(800, 60); }}
            className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            {isPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-cyan-400" />}
          </button>
        </div>
      </div>

      {/* Metric Selector Pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveMetric('all')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
            activeMetric === 'all' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          All Systems
        </button>
        <button
          onClick={() => setActiveMetric('cpu')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1 ${
            activeMetric === 'cpu' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <Cpu className="w-3 h-3 text-cyan-400" /> CPU ({latest.cpu.toFixed(1)}%)
        </button>
        <button
          onClick={() => setActiveMetric('memory')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1 ${
            activeMetric === 'memory' ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <HardDrive className="w-3 h-3 text-emerald-400" /> Memory ({latest.memory.toFixed(1)}%)
        </button>
        <button
          onClick={() => setActiveMetric('latency')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1 ${
            activeMetric === 'latency' ? 'bg-amber-600/30 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <Wifi className="w-3 h-3 text-amber-400" /> Latency ({latest.latency.toFixed(1)}ms)
        </button>
      </div>

      {/* D3 SVG Live Chart Container */}
      <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-2 flex flex-col items-center justify-center overflow-hidden shadow-inner">
        <svg ref={svgRef} viewBox="0 0 560 220" className="w-full h-auto overflow-visible" />
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="bg-slate-950/70 border border-cyan-950 p-2 rounded-xl flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" /> Core Utilization</span>
          <span className="font-mono font-semibold text-cyan-300">{latest.cpu.toFixed(1)}%</span>
        </div>
        <div className="bg-slate-950/70 border border-cyan-950 p-2 rounded-xl flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1"><HardDrive className="w-3 h-3 text-emerald-400" /> RAM Allocated</span>
          <span className="font-mono font-semibold text-emerald-300">{latest.memory.toFixed(1)}%</span>
        </div>
        <div className="bg-slate-950/70 border border-cyan-950 p-2 rounded-xl flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1"><Wifi className="w-3 h-3 text-amber-400" /> Neural Latency</span>
          <span className="font-mono font-semibold text-amber-300">{latest.latency.toFixed(1)}ms</span>
        </div>
      </div>
    </div>
  );
}
