"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function OrbCore({ active, level }: { active: boolean; level: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.x = t * 0.35;
    mesh.current.rotation.y = t * 0.7;
    const pulse = 1 + level * 0.16 + (active ? Math.sin(t * 10) * 0.05 : Math.sin(t * 2) * 0.025);
    mesh.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial color={active ? "#f97316" : "#22d3ee"} emissive={active ? "#ea580c" : "#0891b2"} emissiveIntensity={1.2} roughness={0.28} metalness={0.45} />
    </mesh>
  );
}

function Ring({ active, level, speed, scale, x = 0, y = 0 }: { active: boolean; level: number; speed: number; scale: number; x?: number; y?: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.x = x + t * speed;
    mesh.current.rotation.y = y + t * speed * 0.7;
    mesh.current.scale.setScalar(scale + level * 0.28 + (active ? Math.sin(t * 8) * 0.035 : 0));
  });

  return (
    <mesh ref={mesh}>
      <torusGeometry args={[1.45, 0.012, 12, 120]} />
      <meshBasicMaterial color={active ? "#fb923c" : "#67e8f9"} transparent opacity={0.35 + level * 0.55} />
    </mesh>
  );
}

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  return (
    <Canvas className="orb-canvas" camera={{ position: [0, 0, 5.2], fov: 42 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 2, 4]} intensity={18 + level * 35} color={active ? "#fb923c" : "#67e8f9"} />
      <OrbCore active={active} level={level} />
      <Ring active={active} level={level} speed={0.35 + level * 0.7} scale={0.95} x={0.8} />
      <Ring active={active} level={level} speed={-0.28 - level * 0.55} scale={1.08} y={0.9} />
      <Ring active={active} level={level} speed={0.22 + level * 0.5} scale={1.2} x={1.35} y={0.4} />
    </Canvas>
  );
}
