import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Jarvis3DCoreProps {
  isSpeaking?: boolean;
}

export function Jarvis3DCore({ isSpeaking = false }: Jarvis3DCoreProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene, Camera, Renderer
    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // 1. Arc Reactor Inner 3D Core (Wireframe Icosahedron)
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyan
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // 2. Holographic Outer Orbital Torus
    const torusGeo = new THREE.TorusGeometry(1.8, 0.02, 16, 100);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.rotation.x = Math.PI / 3;
    scene.add(torusMesh);

    // 3. Second Counter-Rotating Orbital Ring
    const torusGeo2 = new THREE.TorusGeometry(2.1, 0.015, 16, 100);
    const torusMat2 = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.3
    });
    const torusMesh2 = new THREE.Mesh(torusGeo2, torusMat2);
    torusMesh2.rotation.y = Math.PI / 4;
    scene.add(torusMesh2);

    // 4. Iron Legion Particle Swarm (50 Particles)
    const particlesCount = 60;
    const posArray = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 4.5;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.6
    });
    const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particlesMesh);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      const speedMultiplier = isSpeaking ? 2.5 : 1.0;

      // Rotate core & rings
      coreMesh.rotation.x = elapsedTime * 0.4 * speedMultiplier;
      coreMesh.rotation.y = elapsedTime * 0.6 * speedMultiplier;

      torusMesh.rotation.z = elapsedTime * 0.5 * speedMultiplier;
      torusMesh2.rotation.x = -elapsedTime * 0.3 * speedMultiplier;

      // Pulse core scale slightly
      const scale = 1 + Math.sin(elapsedTime * 3) * (isSpeaking ? 0.08 : 0.03);
      coreMesh.scale.set(scale, scale, scale);

      // Rotate particle swarm
      particlesMesh.rotation.y = elapsedTime * 0.1;

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
      coreGeo.dispose();
      coreMat.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      torusGeo2.dispose();
      torusMat2.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();
    };
  }, [isSpeaking]);

  return (
    <div 
      ref={mountRef} 
      className="w-full h-full pointer-events-none flex items-center justify-center" 
    />
  );
}
