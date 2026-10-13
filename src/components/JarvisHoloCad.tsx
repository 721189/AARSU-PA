import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Layers, RotateCcw, Cpu, Eye, ShieldAlert } from 'lucide-react';

export function JarvisHoloCad() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [explosionFactor, setExplosionFactor] = useState(0);
  const [selectedSubsystem, setSelectedSubsystem] = useState<'helmet' | 'optics' | 'power' | 'unibeam'>('helmet');

  // References to 3D sub-assemblies for animation and explosion
  const partsRef = useRef<{
    faceplate?: THREE.Mesh;
    cranium?: THREE.Mesh;
    leftOptic?: THREE.Mesh;
    rightOptic?: THREE.Mesh;
    unibeamRing?: THREE.Mesh;
  }>({});

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 260;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const holoCyan = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.6 });
    const holoGold = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.7 });
    const opticMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });

    // 1. Cranium Base
    const craniumGeo = new THREE.CylinderGeometry(0.8, 0.9, 1.4, 16);
    const cranium = new THREE.Mesh(craniumGeo, holoCyan);
    scene.add(cranium);
    partsRef.current.cranium = cranium;

    // 2. Faceplate
    const faceplateGeo = new THREE.BoxGeometry(1.1, 1.1, 0.2);
    const faceplate = new THREE.Mesh(faceplateGeo, holoGold);
    faceplate.position.set(0, 0, 0.85);
    scene.add(faceplate);
    partsRef.current.faceplate = faceplate;

    // 3. Left Optic Eye
    const opticGeo = new THREE.BoxGeometry(0.28, 0.08, 0.05);
    const leftOptic = new THREE.Mesh(opticGeo, opticMat);
    leftOptic.position.set(-0.28, 0.15, 0.98);
    scene.add(leftOptic);
    partsRef.current.leftOptic = leftOptic;

    // 4. Right Optic Eye
    const rightOptic = new THREE.Mesh(opticGeo, opticMat);
    rightOptic.position.set(0.28, 0.15, 0.98);
    scene.add(rightOptic);
    partsRef.current.rightOptic = rightOptic;

    // 5. Unibeam Core Ring (under chin)
    const ringGeo = new THREE.TorusGeometry(0.5, 0.04, 16, 32);
    const unibeamRing = new THREE.Mesh(ringGeo, holoCyan);
    unibeamRing.rotation.x = Math.PI / 2;
    unibeamRing.position.set(0, -1.0, 0.2);
    scene.add(unibeamRing);
    partsRef.current.unibeamRing = unibeamRing;

    // Rotation and interaction loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle yaw rotation
      scene.rotation.y = elapsed * 0.35;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      craniumGeo.dispose();
      faceplateGeo.dispose();
      opticGeo.dispose();
      ringGeo.dispose();
      holoCyan.dispose();
      holoGold.dispose();
      opticMat.dispose();
      renderer.dispose();
    };
  }, []);

  // Update exploded view positions whenever slider changes
  useEffect(() => {
    const p = partsRef.current;
    const factor = explosionFactor / 100;

    if (p.faceplate) {
      p.faceplate.position.z = 0.85 + factor * 1.5;
    }
    if (p.leftOptic && p.rightOptic) {
      p.leftOptic.position.z = 0.98 + factor * 1.7;
      p.leftOptic.position.x = -0.28 - factor * 0.4;
      p.rightOptic.position.z = 0.98 + factor * 1.7;
      p.rightOptic.position.x = 0.28 + factor * 0.4;
    }
    if (p.unibeamRing) {
      p.unibeamRing.position.y = -1.0 - factor * 1.2;
    }
    if (p.cranium) {
      p.cranium.position.y = factor * 0.5;
    }
  }, [explosionFactor]);

  return (
    <div className="flex flex-col gap-2 bg-slate-950/90 border border-cyan-500/40 rounded-xl p-3 text-xs">
      <div className="flex items-center justify-between border-b border-cyan-900/50 pb-2">
        <span className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
          <Layers className="w-3.5 h-3.5 text-cyan-400" /> Mark VII Tactical CAD Blueprint
        </span>
        <span className="text-[9px] text-slate-400 font-mono">SCALE 1:1 • THREE.JS 3D</span>
      </div>

      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="w-full h-44 rounded-lg bg-slate-900/60 border border-cyan-950 flex items-center justify-center relative overflow-hidden" />

      {/* Explosion Slider Control */}
      <div className="flex items-center gap-3 text-[10px] text-slate-300">
        <span className="text-cyan-400 font-semibold whitespace-nowrap">Explode Blueprint:</span>
        <input 
          type="range"
          min="0"
          max="100"
          value={explosionFactor}
          onChange={(e) => setExplosionFactor(Number(e.target.value))}
          className="flex-1 accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
        />
        <span className="font-mono text-cyan-300 w-8">{explosionFactor}%</span>
      </div>

      {/* Subsystem Telemetry Spec Inspector */}
      <div className="grid grid-cols-4 gap-1 text-[9px]">
        <button
          onClick={() => setSelectedSubsystem('helmet')}
          className={`py-1 px-1 rounded border text-center transition-all ${
            selectedSubsystem === 'helmet' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Faceplate
        </button>
        <button
          onClick={() => setSelectedSubsystem('optics')}
          className={`py-1 px-1 rounded border text-center transition-all ${
            selectedSubsystem === 'optics' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Optics HUD
        </button>
        <button
          onClick={() => setSelectedSubsystem('power')}
          className={`py-1 px-1 rounded border text-center transition-all ${
            selectedSubsystem === 'power' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Cranium
        </button>
        <button
          onClick={() => setSelectedSubsystem('unibeam')}
          className={`py-1 px-1 rounded border text-center transition-all ${
            selectedSubsystem === 'unibeam' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Bus Ring
        </button>
      </div>

      {/* Selected Spec Readout */}
      <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg text-[10px] text-slate-300 flex flex-col gap-0.5">
        {selectedSubsystem === 'helmet' && (
          <>
            <span className="font-semibold text-amber-400">Titanium-Gold Alloy Articulated Faceplate</span>
            <span className="text-slate-400">Pneumatic servo-hinges with micro-gasket hermetic vacuum seal. Deflection rating: Class 4 ballistic.</span>
          </>
        )}
        {selectedSubsystem === 'optics' && (
          <>
            <span className="font-semibold text-cyan-300">Targeting Optics & Dual Reticle Sensor Array</span>
            <span className="text-slate-400">Infrared, thermal, and ultraviolet multi-spectrum overlay with 360-degree trajectory tracking.</span>
          </>
        )}
        {selectedSubsystem === 'power' && (
          <>
            <span className="font-semibold text-cyan-300">Cranium Composite Shell & Neural Mesh</span>
            <span className="text-slate-400">Direct neural-synaptic receiver linking Stark cognitive intent with suit thrusters.</span>
          </>
        )}
        {selectedSubsystem === 'unibeam' && (
          <>
            <span className="font-semibold text-cyan-300">Auxiliary Neck Power Distribution Bus</span>
            <span className="text-slate-400">Direct conduit routing 1.8 GW from chest Arc Reactor to dorsal flight stabilizers.</span>
          </>
        )}
      </div>
    </div>
  );
}
