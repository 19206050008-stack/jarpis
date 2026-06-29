"use client";

import { useState } from "react";

export default function Chat() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: "ai", content: "Halo! Saya Anta. Ada yang bisa dibantu?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";

  async function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", content: data.answer || "Maaf, terjadi kesalahan." }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", content: "Koneksi gagal. Coba lagi." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "#d8faff", fontFamily: "Arial, sans-serif", padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#67e8f9", fontSize: 26, margin: 0 }}>Anta Chat</h1>
        <p style={{ opacity: 0.7, fontSize: 14 }}>Percakapan langsung dengan Anta</p>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ height: 420, overflowY: "auto", border: "1px solid #22d3ee33", borderRadius: 12, padding: 16, background: "#020a1a", marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, textAlign: m.role === "user" ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: m.role === "user" ? "#22d3ee22" : "#031228",
                  border: m.role === "user" ? "1px solid #22d3ee55" : "1px solid #22d3ee22",
                  color: m.role === "user" ? "#e0f4ff" : "#d8faff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Anta mengetik...</div>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ketik pesan..."
            style={{ flex: 1, padding: "12px 14px", border: "1px solid #22d3ee44", borderRadius: 8, background: "#020617", color: "#d8faff", fontSize: 15 }}
          />
          <button onClick={send} disabled={loading} style={{ padding: "12px 22px", borderRadius: 8, background: "#22d3ee22", border: "1px solid #22d3ee55", color: "#e0f4ff", cursor: "pointer" }}>
            Kirim
          </button>
        </div>
      </div>
    </main>
  );
}