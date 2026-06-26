"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function OrbCore({ active }: { active: boolean }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.x = t * 0.35;
    mesh.current.rotation.y = t * 0.7;
    const pulse = active ? 1 + Math.sin(t * 10) * 0.08 : 1 + Math.sin(t * 2) * 0.025;
    mesh.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial color={active ? "#f97316" : "#22d3ee"} emissive={active ? "#ea580c" : "#0891b2"} emissiveIntensity={1.2} roughness={0.28} metalness={0.45} />
    </mesh>
  );
}

function Ring({ active, speed, scale, x = 0, y = 0 }: { active: boolean; speed: number; scale: number; x?: number; y?: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.x = x + t * speed;
    mesh.current.rotation.y = y + t * speed * 0.7;
    mesh.current.scale.setScalar(scale + (active ? Math.sin(t * 8) * 0.04 : 0));
  });

  return (
    <mesh ref={mesh}>
      <torusGeometry args={[1.45, 0.012, 12, 120]} />
      <meshBasicMaterial color={active ? "#fb923c" : "#67e8f9"} transparent opacity={active ? 0.85 : 0.45} />
    </mesh>
  );
}

export default function AntaOrb3D({ active }: { active: boolean }) {
  return (
    <Canvas className="orb-canvas" camera={{ position: [0, 0, 4.2], fov: 45 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 2, 4]} intensity={active ? 35 : 18} color={active ? "#fb923c" : "#67e8f9"} />
      <OrbCore active={active} />
      <Ring active={active} speed={0.35} scale={1} x={0.8} />
      <Ring active={active} speed={-0.28} scale={1.12} y={0.9} />
      <Ring active={active} speed={0.22} scale={1.24} x={1.35} y={0.4} />
    </Canvas>
  );
}
