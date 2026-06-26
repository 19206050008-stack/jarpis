"use client";

import type { CSSProperties } from "react";

const BARS = Array.from({ length: 96 }, (_, i) => i);

export default function AntaOrb3D({ active, level = 0 }: { active: boolean; level?: number }) {
  const safeLevel = Math.min(1, Math.max(0, level));

  return (
    <div className={`jarvis-orb ${active ? "speaking" : ""}`} style={{ "--level": safeLevel } as CSSProperties}>
      <div className="jarvis-glow" />
      <div className="jarvis-ring outer" />
      <div className="jarvis-bars">
        {BARS.map((i) => {
          const weight = i % 8 === 0 ? 1.4 : i % 3 === 0 ? 1.05 : 0.72;
          return <span key={i} style={{ "--i": i, "--h": 5 + safeLevel * 18 * weight } as CSSProperties} />;
        })}
      </div>
      <div className="jarvis-ring main" />
      <div className="jarvis-core" />
    </div>
  );
}
