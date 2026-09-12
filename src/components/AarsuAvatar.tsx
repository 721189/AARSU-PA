import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';
import { Emotion } from '../types';

interface AarsuAvatarProps {
  emotion: Emotion;
}

export function AarsuAvatar({ emotion }: AarsuAvatarProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;
    const time = state.clock.getElapsedTime();

    // Base properties
    let targetDistort = 0.3;
    let targetSpeed = 1;
    let targetColor = new THREE.Color('#00ffff'); // Cyan default

    // Emotion-based overrides
    switch (emotion) {
      case 'happiness':
        targetColor.set('#ff00aa');
        targetDistort = 0.5;
        targetSpeed = 3;
        meshRef.current.position.y = Math.sin(time * 3) * 0.2;
        break;
      case 'curiosity':
        targetColor.set('#aa00ff');
        targetDistort = 0.6;
        targetSpeed = 2;
        meshRef.current.rotation.z = Math.sin(time) * 0.3;
        break;
      case 'confusion':
        targetColor.set('#ffaa00');
        targetDistort = 0.8;
        targetSpeed = 5;
        meshRef.current.position.x = Math.sin(time * 10) * 0.1;
        break;
      case 'empathy':
        targetColor.set('#ffbbcc');
        targetDistort = 0.2;
        targetSpeed = 0.5;
        break;
      case 'excitement':
        targetColor.set('#ffffff');
        targetDistort = 1.0;
        targetSpeed = 8;
        meshRef.current.rotation.y += 0.05;
        break;
      default: // neutral
        targetColor.set('#00aaff');
        targetDistort = 0.3;
        targetSpeed = 1;
        meshRef.current.position.y = 0;
        meshRef.current.position.x = 0;
        meshRef.current.rotation.z = 0;
        break;
    }

    // Lerp properties for smooth transitions
    materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.05);
    materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, 0.05);
    materialRef.current.color.lerp(targetColor, 0.05);
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <Sphere ref={meshRef} args={[1.5, 64, 64]}>
        <MeshDistortMaterial
          ref={materialRef}
          color="#00ffff"
          envMapIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          metalness={0.8}
          roughness={0.2}
          distort={0.3}
          speed={1}
        />
      </Sphere>
      {/* Abstract Facial Features */}
      <mesh position={[-0.5, 0.2, 1.3]}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.5, 0.2, 1.3]}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </Float>
  );
}
