"use client";
import { useState } from "react";

export default function Dashboard() {
  const [orbMode, setOrbMode] = useState<"idle" | "listening" | "active">("idle");
  const [subtitle, setSubtitle] = useState("Halo, saya Anta. Siap membantu.");

  return (
    <main className="jarvis-desktop" style={{ padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "40px auto" }}>
        <header style={{ marginBottom: 32, textAlign: "center" }}>
          <h1 style={{ color: "#67e8f9", fontSize: 26, margin: 0, letterSpacing: 1 }}>Dashboard</h1>
        </header>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div style={{ position: "relative", width: 180, height: 180 }}>
            <div
              className={`orb-equalizer ${orbMode}`}
              style={{
                width: 180, height: 180,
                background: orbMode === "active"
                  ? "radial-gradient(circle at 30% 25%, #ffffff 0%, #fbbf24 8%, #f97316 25%, #ea580c 50%, #9a3412 75%, #431407 100%)"
                  : orbMode === "listening"
                  ? "radial-gradient(circle at 30% 25%, #ffffff 0%, #a78bfa 8%, #7c3aed 25%, #6d28d9 50%, #5b21b6 75%, #4c1d95 100%)"
                  : "radial-gradient(circle at 30% 25%, #ffffff 0%, #22d3ee 8%, #06b6d4 25%, #0891b2 50%, #0e7490 75%, #164e63 100%)",
                boxShadow: "0 0 50px #22d3ee44, inset 0 0 30px rgba(255,255,255,0.1)",
              }}
            />
          </div>

          <div className="subtitle-bubble" style={{ position: "static", transform: "none", maxWidth: 380, textAlign: "center" }}>
            {subtitle}
          </div>
        </div>
      </div>
    </main>
  );
}