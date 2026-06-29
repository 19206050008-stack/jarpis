"use client";

import { useState, useEffect } from "react";

export default function Dashboard() {
  const [subtitle, setSubtitle] = useState("Halo, saya Anta. Siap membantu.");
  const [orbMode, setOrbMode] = useState<"idle" | "listening" | "active">("idle");

  useEffect(() => {
    // Demo: cycle through states
    const timer = setInterval(() => {
      setOrbMode((prev) => {
        if (prev === "idle") return "listening";
        if (prev === "listening") return "active";
        return "idle";
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "#d8faff", fontFamily: "Arial, sans-serif", padding: 24 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#67e8f9", fontSize: 28, margin: 0 }}>Anta Dashboard</h1>
        <p style={{ opacity: 0.7, marginTop: 4 }}>Status & Visual</p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Anta Orb Visual */}
        <div style={{ position: "relative", width: 200, height: 200 }}>
          <div
            className={`orb-equalizer ${orbMode}`}
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: orbMode === "active"
                ? "radial-gradient(circle at 30% 25%, #ffffff 0%, #fbbf24 8%, #f97316 25%, #ea580c 50%, #9a3412 75%, #431407 100%)"
                : orbMode === "listening"
                ? "radial-gradient(circle at 30% 25%, #ffffff 0%, #a78bfa 8%, #7c3aed 25%, #6d28d9 50%, #5b21b6 75%, #4c1d95 100%)"
                : "radial-gradient(circle at 30% 25%, #ffffff 0%, #22d3ee 8%, #06b6d4 25%, #0891b2 50%, #0e7490 75%, #164e63 100%)",
              boxShadow: "0 0 60px #22d3ee44, inset 0 0 40px rgba(255,255,255,0.1)",
              transition: "all 0.5s ease",
            }}
          />
          {/* Core glow */}
          <div
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)",
              animation: orbMode === "active" ? "pulse 1.5s infinite" : "none",
            }}
          />
        </div>

        {/* Speech Bubble */}
        <div
          style={{
            maxWidth: 420,
            padding: "16px 24px",
            background: "linear-gradient(180deg, #020a1a 0%, #031228 100%)",
            border: "1.5px solid #22d3ee",
            borderRadius: 0,
            clipPath: "polygon(12px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 12px, 7px 5px, 12px 0)",
            boxShadow: "0 0 8px #22d3ee44, inset 0 0 16px #00244488",
            textAlign: "center",
            color: "#e0f4ff",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>

        <div style={{ marginTop: 40, opacity: 0.6, fontSize: 13 }}>
          Status: {orbMode} • Chat & Voice aktif • Provider: OpenRouter + OpenAgentic
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </main>
  );
}