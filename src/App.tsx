import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AarsuAvatar } from './components/AarsuAvatar';
import { ChatInterface } from './components/ChatInterface';
import { Emotion } from './types';

export default function App() {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID || 'dummy-client-id';

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="w-full h-screen bg-slate-950 overflow-hidden relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />
        
        {/* 3D Canvas for Aarsu's Face */}
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
            <color attach="background" args={['#0a0f1a']} />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
            <Suspense fallback={null}>
              <AarsuAvatar emotion={emotion} />
              <Environment preset="city" />
              <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={10} blur={2} far={4} />
            </Suspense>
          </Canvas>
        </div>

        {/* UI Layer */}
        <ChatInterface onEmotionChange={setEmotion} />
      </div>
    </GoogleOAuthProvider>
  );
}

