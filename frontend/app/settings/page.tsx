"use client";

export default function Settings() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "#d8faff", fontFamily: "Arial, sans-serif", padding: 24 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#67e8f9", fontSize: 26, margin: 0 }}>Anta Settings</h1>
        <p style={{ opacity: 0.7, marginTop: 4 }}>Konfigurasi & Status</p>
      </header>

      <div style={{ maxWidth: 520 }}>
        <section style={{ marginBottom: 32 }}>
          <h3 style={{ color: "#67e8f9", fontSize: 15, marginBottom: 10 }}>Backend</h3>
          <div style={{ padding: 14, border: "1px solid #22d3ee33", borderRadius: 10, background: "#020a1a" }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>API URL</div>
            <div style={{ fontFamily: "monospace", color: "#67e8f9", marginTop: 4 }}>{apiUrl}</div>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h3 style={{ color: "#67e8f9", fontSize: 15, marginBottom: 10 }}>Provider AI</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {["OpenRouter", "OpenAgentic", "Pollinations"].map((p) => (
              <div key={p} style={{ padding: 12, border: "1px solid #22d3ee22", borderRadius: 10, background: "#020a1a", display: "flex", justifyContent: "space-between" }}>
                <span>{p}</span>
                <span style={{ color: "#22c55e", fontSize: 13 }}>Aktif (via env)</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>API keys dibaca otomatis dari environment. Tidak perlu input manual.</p>
        </section>

        <section>
          <h3 style={{ color: "#67e8f9", fontSize: 15, marginBottom: 10 }}>Voice & TTS</h3>
          <div style={{ padding: 14, border: "1px solid #22d3ee33", borderRadius: 10, background: "#020a1a", fontSize: 14 }}>
            Supertonic TTS • 10 suara Indonesia tersedia
          </div>
        </section>
      </div>
    </main>
  );
}