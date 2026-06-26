"use client";

import type { CSSProperties } from "react";

const BARS = Array.from({ length: 96 }, (_, i) => i);

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));
  const center = 110;
  const inner = 66;

  return (
    <div className={`jarvis-orb ${active ? "speaking" : ""}`} style={{ "--level": safeLevel } as CSSProperties}>
      <div className="jarvis-glow" />
      <svg className="jarvis-eq" viewBox="0 0 220 220" aria-hidden="true">
        {BARS.map((i) => {
          const a = (i / BARS.length) * Math.PI * 2 - Math.PI / 2;
          const weight = i % 8 === 0 ? 1.35 : i % 3 === 0 ? 1.05 : 0.75;
          const h = 4 + safeLevel * 10 * weight;
          const x1 = center + Math.cos(a) * inner;
          const y1 = center + Math.sin(a) * inner;
          const x2 = center + Math.cos(a) * (inner + h);
          const y2 = center + Math.sin(a) * (inner + h);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>
      <div className="jarvis-ring outer" />
      <div className="jarvis-ring main" />
      <div className="jarvis-core" />
    </div>
  );
}
