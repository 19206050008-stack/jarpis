"use client";
export default function Settings() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";
  return (
    <main className="jarvis-desktop" style={{ padding: 24 }}>
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        <div className="popup-window" style={{ position: "static", width: "100%", padding: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#67e8f9", fontSize: 13, marginBottom: 6 }}>Backend</div>
            <div style={{ fontFamily: "monospace", color: "#22d3ee", fontSize: 13 }}>{apiUrl}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#67e8f9", fontSize: 13, marginBottom: 8 }}>Provider</div>
            {["OpenRouter", "OpenAgentic", "Pollinations"].map((p, i) => (
              <div key={i} style={{ padding: "8px 12px", border: "1px solid #22d3ee22", borderRadius: 8, background: "#020a1a", marginBottom: 6, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                <span>{p}</span><span style={{ color: "#22c55e" }}>Aktif</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: "#67e8f9", fontSize: 13, marginBottom: 6 }}>Voice & TTS</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Supertonic • 10 suara Indonesia</div>
          </div>
        </div>
      </div>
    </main>
  );
}