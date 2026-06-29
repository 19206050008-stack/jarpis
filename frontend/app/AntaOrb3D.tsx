"use client";

import type { CSSProperties } from "react";

const BARS = Array.from({ length: 96 }, (_, i) => i);
const TICKS = Array.from({ length: 72 }, (_, i) => i);
const PANELS = Array.from({ length: 24 }, (_, i) => i);
const DOTS = Array.from({ length: 6 }, (_, i) => i);
const n = (value: number) => Number(value.toFixed(3));

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));
  const center = 110;
  const inner = 66;

  // CSS variables for organic sizing/deform morphing based on level
  const baseScale = active ? 1.08 : 0.95;
  const scale = baseScale + safeLevel * 0.15;
  // Morph border radius to look organic / blob-like when speaking
  const borderRadius = active
    ? `${50 + Math.sin(safeLevel * 10) * 8}% ${50 - Math.cos(safeLevel * 10) * 8}% ${50 + Math.cos(safeLevel * 10) * 10}% ${50 - Math.sin(safeLevel * 10) * 10}% / ${50 - Math.cos(safeLevel * 10) * 8}% ${50 + Math.sin(safeLevel * 10) * 8}% ${50 - Math.sin(safeLevel * 10) * 10}% ${50 + Math.cos(safeLevel * 10) * 10}%`
    : "50%";

  return (
    <div className={`jarvis-orb ${active ? "speaking" : ""}`} style={{ "--level": safeLevel } as CSSProperties}>
      <div className="jarvis-glow" />

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
      <div className="jarvis-ring outer" style={{ pointerEvents: "none" }} />
      <div className="jarvis-ring main" style={{ pointerEvents: "none" }} />
      
      {/* CSS Glossy 3D Sphere Core (Robust & compatible, no WebGL crash) */}
      <div
        className="jarvis-core"
        style={{
          transform: `scale(${scale})`,
          borderRadius,
          transition: "border-radius 0.15s ease, transform 0.05s ease",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
