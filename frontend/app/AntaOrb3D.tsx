"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";

function Core({ active, level }: { active: boolean; level: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.y = t * 0.35;
    mesh.current.scale.setScalar(0.72 + level * 0.08 + Math.sin(t * 2) * 0.01);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color={active ? "#f97316" : "#22d3ee"} emissive={active ? "#ea580c" : "#0891b2"} emissiveIntensity={1.1 + level * 1.4} roughness={0.2} metalness={0.5} />
    </mesh>
  );
}

function CircleRing({ active, level, radius, width, opacity }: { active: boolean; level: number; radius: number; width: number; opacity: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.rotation.z = state.clock.elapsedTime * (0.08 + level * 0.18);
  });

  return (
    <mesh ref={mesh}>
      <torusGeometry args={[radius, width, 8, 180]} />
      <meshBasicMaterial color={active ? "#fb923c" : "#22d3ee"} transparent opacity={opacity + level * 0.25} />
    </mesh>
  );
}

function EqualizerRing({ active, level }: { active: boolean; level: number }) {
  const group = useRef<Group>(null);
  const bars = useMemo(() => Array.from({ length: 72 }, (_, i) => i), []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = t * (active ? 0.18 : 0.08);
    group.current.children.forEach((child, i) => {
      const wave = (Math.sin(t * 10 + i * 0.55) + 1) / 2;
      const beat = active ? level * (0.6 + wave * 1.9) : wave * 0.08;
      child.scale.y = 0.55 + beat;
      child.scale.x = 0.85 + level * 0.35;
    });
  });

  return (
    <group ref={group}>
      {bars.map((i) => {
        const angle = (i / bars.length) * Math.PI * 2;
        const radius = 1.72;
        const tall = i % 6 === 0;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]} rotation={[0, 0, angle - Math.PI / 2]}>
            <boxGeometry args={[0.018, tall ? 0.18 : 0.11, 0.018]} />
            <meshBasicMaterial color={active ? "#fdba74" : "#22d3ee"} transparent opacity={active ? 0.75 : 0.38} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));

  return (
    <Canvas className="orb-canvas" camera={{ position: [0, 0, 6], fov: 35 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.75} />
      <pointLight position={[1.6, 1.8, 4]} intensity={18 + safeLevel * 45} color={active ? "#fb923c" : "#67e8f9"} />
      <Core active={active} level={safeLevel} />
      <CircleRing active={active} level={safeLevel} radius={1.28} width={0.025} opacity={0.65} />
      <CircleRing active={active} level={safeLevel} radius={1.55} width={0.006} opacity={0.18} />
      <EqualizerRing active={active} level={safeLevel} />
    </Canvas>
  );
}
