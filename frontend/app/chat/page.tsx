"use client";
import { useState } from "react";

export default function Chat() {
  const [messages, setMessages] = useState([{ role: "ai", content: "Halo! Saya Anta." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";

  async function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages(m => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      setMessages(m => [...m, { role: "ai", content: data.answer || "Error" }]);
    } catch {
      setMessages(m => [...m, { role: "ai", content: "Koneksi gagal." }]);
    } finally { setLoading(false); }
  }

  return (
    <main className="jarvis-desktop" style={{ padding: 24 }}>
      <div style={{ maxWidth: 680, margin: "40px auto" }}>
        <div className="popup-window chat-window" style={{ position: "static", width: "100%", height: 480 }}>
          <div className="chat" style={{ height: 420 }}>
            {messages.map((m, i) => <div key={i} className={`msg ${m.role === "user" ? "user" : "ai"}`}>{m.content}</div>)}
            {loading && <div className="msg ai typing">Anta mengetik...</div>}
          </div>
          <div className="form">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ketik..." />
            <button onClick={send} disabled={loading}>Kirim</button>
          </div>
        </div>
      </div>
    </main>
  );
}