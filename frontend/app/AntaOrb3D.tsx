"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

function Core({ active, level }: { active: boolean; level: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.y = t * 0.45;
    mesh.current.scale.setScalar(0.78 + level * 0.12 + Math.sin(t * 2) * 0.015);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color={active ? "#f97316" : "#22d3ee"} emissive={active ? "#ea580c" : "#0891b2"} emissiveIntensity={1.3 + level * 1.5} roughness={0.18} metalness={0.55} />
    </mesh>
  );
}

function OrbitDots({ active, level, count = 18, radius = 1.45, tilt = 0 }: { active: boolean; level: number; count?: number; radius?: number; tilt?: number }) {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = tilt;
    group.current.rotation.y = t * (0.45 + level * 1.3);
    group.current.rotation.x = Math.sin(t * 0.7) * 0.16;
  });

  return (
    <group ref={group}>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / count) * Math.PI * 2;
        const loud = 1 + level * (i % 3 === 0 ? 2.2 : 1.2);
        const size = (i % 3 === 0 ? 0.045 : 0.028) * loud;
        return (
          <mesh key={i} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]} scale={size}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color={active ? "#fdba74" : "#67e8f9"} transparent opacity={0.35 + level * 0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

function OrbitLine({ active, level, tilt }: { active: boolean; level: number; tilt: number }) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.z = tilt;
    mesh.current.rotation.y = t * (0.25 + level * 0.8);
    mesh.current.scale.setScalar(0.92 + level * 0.16);
  });

  return (
    <mesh ref={mesh}>
      <torusGeometry args={[1.45, 0.006, 8, 160]} />
      <meshBasicMaterial color={active ? "#fb923c" : "#67e8f9"} transparent opacity={0.25 + level * 0.35} />
    </mesh>
  );
}

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));

  return (
    <Canvas className="orb-canvas" camera={{ position: [0, 0, 5.4], fov: 38 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.7} />
      <pointLight position={[2, 2, 4]} intensity={16 + safeLevel * 45} color={active ? "#fb923c" : "#67e8f9"} />
      <Core active={active} level={safeLevel} />
      <OrbitLine active={active} level={safeLevel} tilt={0} />
      <OrbitLine active={active} level={safeLevel} tilt={Math.PI / 2.8} />
      <OrbitDots active={active} level={safeLevel} tilt={0} />
      <OrbitDots active={active} level={safeLevel} count={14} radius={1.24} tilt={Math.PI / 2.8} />
    </Canvas>
  );
}
