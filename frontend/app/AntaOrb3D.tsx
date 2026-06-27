"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo, type CSSProperties } from "react";
import type { Mesh, ShaderMaterial } from "three";

const BARS = Array.from({ length: 96 }, (_, i) => i);
const TICKS = Array.from({ length: 72 }, (_, i) => i);
const PANELS = Array.from({ length: 24 }, (_, i) => i);
const DOTS = Array.from({ length: 6 }, (_, i) => i);
const n = (value: number) => Number(value.toFixed(3));

// Custom organic blob shader with Perlin noise
const BlobShader = {
  vertexShader: `
    uniform float uTime;
    uniform float uLevel;
    varying vec3 vNormal;
    varying vec3 vPosition;

    // Naive 3D Noise for organic movement
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float noise(vec3 x) {
      vec3 p = floor(x);
      vec3 f = fract(x);
      f = f*f*(3.0-2.0*f);
      float n = p.x + p.y*157.0 + 113.0*p.z;
      return mix(mix(mix(hash(n+0.0), hash(n+1.0), f.x),
                     mix(hash(n+157.0), hash(n+158.0), f.x), f.y),
                 mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                     mix(hash(n+270.0), hash(n+271.0), f.x), f.y), f.z);
    }

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      
      // Calculate noise displacement based on time and audio level
      float noiseFactor = noise(position * 2.2 + uTime * 1.5) * (0.08 + uLevel * 0.22);
      vec3 displacedPosition = position + normal * noiseFactor;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorBase;
    uniform vec3 uColorGlow;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Fresnel effect for futuristic holographic glow
      float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
      vec3 glow = uColorGlow * intensity;
      
      // Shading based on normals
      float diff = max(0.0, dot(vNormal, normalize(vec3(1.0, 1.0, 2.0))));
      vec3 base = uColorBase * (0.35 + diff * 0.65);
      
      gl_FragColor = vec4(base + glow, 1.0);
    }
  `
};

function BlobCore({ active, level }: { active: boolean; level: number }) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uColorBase: { value: null },
    uColorGlow: { value: null }
  }), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.22;
      meshRef.current.rotation.x = t * 0.11;
      const baseScale = active ? 1.08 : 0.95;
      meshRef.current.scale.setScalar(baseScale + Math.sin(t * 2.5) * 0.015);
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uLevel.value = level;
      
      // Interpolate colors based on speaking status
      const importColor = (hex: string) => {
        const c = parseInt(hex.replace("#", ""), 16);
        return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
      };
      
      const baseColor = active ? importColor("#ea580c") : importColor("#0891b2");
      const glowColor = active ? importColor("#fff7ed") : importColor("#e0fbff");
      
      if (!materialRef.current.uniforms.uColorBase.value) {
        materialRef.current.uniforms.uColorBase.value = { set: () => {} };
        materialRef.current.uniforms.uColorGlow.value = { set: () => {} };
      }
      
      materialRef.current.uniforms.uColorBase.value = baseColor;
      materialRef.current.uniforms.uColorGlow.value = glowColor;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.05, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={BlobShader.vertexShader}
        fragmentShader={BlobShader.fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

function HologramRing({ active, level, speed, radius, thickness }: { active: boolean; level: number; speed: number; radius: number; thickness: number }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    meshRef.current.rotation.z = t * speed;
    meshRef.current.rotation.x = Math.sin(t * 0.4) * 0.25;
    meshRef.current.rotation.y = Math.cos(t * 0.3) * 0.25;
    const scaleFactor = 1.0 + (active ? level * 0.08 : 0);
    meshRef.current.scale.setScalar(scaleFactor);
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, thickness, 8, 96]} />
      <meshBasicMaterial
        color={active ? "#f97316" : "#22d3ee"}
        transparent
        opacity={active ? 0.72 : 0.28}
      />
    </mesh>
  );
}

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));
  const center = 110;
  const inner = 66;

  return (
    <div className={`jarvis-orb ${active ? "speaking" : ""}`} style={{ "--level": safeLevel } as CSSProperties}>
      <div className="jarvis-glow" />

      {/* SVG HUD Graphic Layer */}
      <svg className="jarvis-hud" viewBox="0 0 220 220" aria-hidden="true" style={{ pointerEvents: "none" }}>
        <circle className="hud-circle faint" cx="110" cy="110" r="95" />
        <circle className="hud-circle thin" cx="110" cy="110" r="82" />
        <circle className="hud-circle broken" cx="110" cy="110" r="102" />
        <path className="hud-arc bright" d="M42 178 A96 96 0 0 1 59 30" />
        <path className="hud-arc" d="M169 31 A96 96 0 0 1 190 166" />
        <path className="hud-arc short" d="M44 47 A88 88 0 0 1 100 21" />
        <path className="hud-arc short right" d="M133 21 A88 88 0 0 1 183 55" />

        {TICKS.map((i) => {
          const a = (i / TICKS.length) * Math.PI * 2 - Math.PI / 2;
          const major = i % 6 === 0;
          const r1 = major ? 86 : 89;
          const r2 = major ? 94 : 93;
          return <line key={i} className={major ? "hud-tick major" : "hud-tick"} x1={n(center + Math.cos(a) * r1)} y1={n(center + Math.sin(a) * r1)} x2={n(center + Math.cos(a) * r2)} y2={n(center + Math.sin(a) * r2)} />;
        })}

        {PANELS.map((i) => {
          const a = (i / PANELS.length) * Math.PI * 2;
          const x = n(center + Math.cos(a) * 78);
          const y = n(center + Math.sin(a) * 78);
          return <rect key={i} className="hud-panel" x={n(x - 5)} y={n(y - 3)} width="10" height="6" rx="1" transform={`rotate(${n((a * 180) / Math.PI + 90)} ${x} ${y})`} />;
        })}

        {DOTS.map((i) => {
          const a = (i / DOTS.length) * Math.PI * 2 + 0.25;
          return <circle key={i} className="hud-node" cx={n(center + Math.cos(a) * 104)} cy={n(center + Math.sin(a) * 104)} r="5" />;
        })}
      </svg>

      <div className="hud-readout left">
        <b>ANTA</b><span>CORE</span><span>SYNC</span><span>VOICE</span>
      </div>
      <div className="hud-readout right">
        <b>{active ? "LIVE" : "IDLE"}</b><span>{Math.round(safeLevel * 100)}%</span><span>EQ</span>
      </div>

      {/* Audio Reactive SVG Equalizer Ticks */}
      <svg className="jarvis-eq" viewBox="0 0 220 220" aria-hidden="true" style={{ pointerEvents: "none" }}>
        {BARS.map((i) => {
          const a = (i / BARS.length) * Math.PI * 2 - Math.PI / 2;
          const weight = i % 8 === 0 ? 1.35 : i % 3 === 0 ? 1.05 : 0.75;
          const h = 4 + safeLevel * 10 * weight;
          const x1 = center + Math.cos(a) * inner;
          const y1 = center + Math.sin(a) * inner;
          const x2 = center + Math.cos(a) * (inner + h);
          const y2 = center + Math.sin(a) * (inner + h);
          return <line key={i} x1={n(x1)} y1={n(y1)} x2={n(x2)} y2={n(y2)} />;
        })}
      </svg>

      {/* 3D WebGL Holographic Orb Core Canvas */}
      <div style={{ position: "absolute", width: "56%", height: "56%", borderRadius: "50%", overflow: "hidden", zIndex: 1 }}>
        <Canvas camera={{ position: [0, 0, 3.0], fov: 45 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={0.5} />
          <BlobCore active={active} level={safeLevel} />
          <HologramRing active={active} level={safeLevel} speed={0.4} radius={1.12} thickness={0.008} />
          <HologramRing active={active} level={safeLevel} speed={-0.3} radius={1.2} thickness={0.005} />
        </Canvas>
      </div>

      {/* Inner Flat base ring for HUD overlay */}
      <div className="jarvis-ring main" style={{ pointerEvents: "none", zIndex: 2 }} />
    </div>
  );
}
