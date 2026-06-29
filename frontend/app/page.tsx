"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "ai"; text: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  start(): void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws/chat";
const sessionId = () => {
  const key = "jarpis_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const fresh = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, fresh);
  return fresh;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Halo, saya Jarpis. Mau mulai dari mana?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState("andi");
  const [tts, setTts] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${apiUrl}/chat/history?session_id=${sessionId()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => Array.isArray(rows) && rows.length && setMessages(rows))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function newSession() {
    localStorage.removeItem("jarpis_session_id");
    setMessages([{ role: "ai", text: "Sesi baru. Mau bahas apa?" }]);
  }

  async function clearSession() {
    await fetch(`${apiUrl}/chat/history?session_id=${sessionId()}`, { method: "DELETE" }).catch(() => {});
    newSession();
  }

  async function copyChat() {
    const text = messages.map((m) => `${m.role === "user" ? "User" : "Jarpis"}: ${m.text}`).join("\n\n");
    await navigator.clipboard.writeText(text).catch(() => {});
  }

  async function speak(text: string) {
    if (!tts) return;
    const res = await fetch(`${apiUrl}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 500), speaker: voice }),
    });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play().catch(() => URL.revokeObjectURL(url));
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung voice input.");
    const rec = new SR();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.onresult = (event) => setInput(event.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function askWs(text: string) {
    return new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => { ws.close(); reject(new Error("WebSocket timeout")); }, 70000);
      ws.onopen = () => ws.send(JSON.stringify({ message: text, session_id: sessionId() }));
      ws.onerror = () => reject(new Error("WebSocket gagal"));
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== "answer") return;
        clearTimeout(timer);
        ws.close();
        resolve(data.text || "Tidak ada jawaban.");
      };
    });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const answer = (await askWs(text)).trim() || "Tidak ada jawaban.";
      setMessages((m) => [...m, { role: "ai", text: answer }]);
      await speak(answer);
    } catch (err) {
      setMessages((m) => [...m, { role: "ai", text: `Chat gagal: ${err instanceof Error ? err.message : "backend tidak merespons"}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <section className="panel">
        <header>
          <div>
            <h1>Jarpis</h1>
            <p>UI sederhana dulu. Backend: {apiUrl}</p>
          </div>
          <nav>
            <a href="/">Chat</a>
            <a href="/settings">Status</a>
          </nav>
          <button className="ghost" onClick={newSession} type="button">Sesi baru</button>
          <button className="ghost" onClick={copyChat} type="button">Salin</button>
          <button className="ghost" onClick={clearSession} type="button">Hapus</button>
          <span className={loading ? "dot busy" : "dot"} />
        </header>

        <div className="toolbar">
          <label><input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} /> Suara</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            {"andi budi agus bayu dimas sari dewi ayu rina maya".split(" ").map((v) => <option key={v}>{v}</option>)}
          </select>
          <button className="ghost" onClick={listen} type="button">{listening ? "Dengar..." : "Mic"}</button>
        </div>

        <div className="chat">
          {messages.map((m, i) => (
            <div className={`msg ${m.role}`} key={i}>{m.text}</div>
          ))}
          {loading && <div className="msg ai">Mengetik...</div>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send}>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pesan..."
          />
          <button disabled={loading || !input.trim()}>Kirim</button>
        </form>
      </section>
    </main>
  );
}
