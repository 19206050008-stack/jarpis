"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "ai"; text: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
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
  const key = "anta_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const fresh = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, fresh);
  return fresh;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Siap. Ketuk orb lalu bicara." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState("kira");
  const [tts, setTts] = useState(true);
  const [listening, setListening] = useState(false);
  const [subtitle, setSubtitle] = useState("Ketuk orb lalu bicara");
  const bottomRef = useRef<HTMLDivElement>(null);
  const orbFrameRef = useRef<HTMLIFrameElement>(null);

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
    localStorage.removeItem("anta_session_id");
    setMessages([{ role: "ai", text: "Sesi baru. Mau bahas apa?" }]);
  }

  async function clearSession() {
    await fetch(`${apiUrl}/chat/history?session_id=${sessionId()}`, { method: "DELETE" }).catch(() => {});
    newSession();
  }

  async function copyChat() {
    const text = messages.map((m) => `${m.role === "user" ? "User" : "Anta"}: ${m.text}`).join("\n\n");
    await navigator.clipboard.writeText(text).catch(() => {});
  }

  function categoryFor(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("buka") || lower.includes("open")) return "Membuka aplikasi";
    if (lower.includes("cari") || lower.includes("berita") || lower.includes("gambar") || lower.includes("video") || lower.includes("harga")) return "Loading / mencari";
    if (lower.includes("dengar") || lower.includes("bicara")) return "Suara aktif";
    return "Menerima perintah";
  }

  async function playTemplate(category: string) {
    const res = await fetch(`${apiUrl}/speak-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }).catch(() => null);
    if (!res?.ok) return;
    const encoded = res.headers.get("x-anta-text");
    if (encoded) setSubtitle(decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")))));
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play().catch(() => URL.revokeObjectURL(url));
  }

  function rippleOrb(x = 0.5, y = 0.5) {
    orbFrameRef.current?.contentWindow?.postMessage({ type: "anta-ripple", nx: x, ny: y }, "*");
  }

  function audioOrb(audio: HTMLAudioElement) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (audio.paused || audio.ended) { ctx.close().catch(() => {}); return; }
      analyser.getByteFrequencyData(data);
      const avg = (from: number, to: number) => data.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from) / 255;
      orbFrameRef.current?.contentWindow?.postMessage({ type: "anta-audio", bass: avg(0, 10), mid: avg(10, 32), treble: avg(32, data.length), overall: avg(0, data.length) }, "*");
      requestAnimationFrame(tick);
    };
    tick();
  }

  async function speak(text: string) {
    const words = text.split(/\s+/).filter(Boolean);
    let i = 0;
    const karaoke = setInterval(() => {
      i = Math.min(words.length, i + 2);
      setSubtitle(words.slice(0, i).join(" "));
      if (i >= words.length) clearInterval(karaoke);
    }, 180);

    if (!tts) return;
    const res = await fetch(`${apiUrl}/speak-kira`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 500), speaker: voice }),
    });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.onplay = () => audioOrb(audio);
    audio.onended = () => { clearInterval(karaoke); setSubtitle(text); URL.revokeObjectURL(url); };
    await audio.play().catch(() => URL.revokeObjectURL(url));
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung voice input.");
    const rec = new SR();
    let sent = false;
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      text = text.trim();
      setInput(text);
      setSubtitle(text || "Mendengar...");
      const last = event.results[event.results.length - 1];
      if (last?.isFinal && text && !sent) {
        sent = true;
        sendText(text);
      }
    };
    rec.onend = () => setListening(false);
    setSubtitle("Mendengar...");
    rippleOrb();
    setListening(true);
    rec.start();
  }

  function openSpotify() {
    window.open("https://open.spotify.com", "_blank", "noopener,noreferrer");
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

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setSubtitle(text);
    setMessages((m) => [...m, { role: "user", text }]);
    playTemplate(categoryFor(text));

    if (/\b(buka|open)\b.*\bspotify\b|\bspotify\b.*\b(buka|open)\b/i.test(text)) {
      openSpotify();
      setSubtitle("Spotify saya buka di tab baru.");
      setMessages((m) => [...m, { role: "ai", text: "Spotify saya buka di tab baru." }]);
      setLoading(false);
      return;
    }

    try {
      const answer = (await askWs(text)).trim() || "Tidak ada jawaban.";
      setSubtitle(answer);
      setMessages((m) => [...m, { role: "ai", text: answer }]);
      await speak(answer);
    } catch (err) {
      setMessages((m) => [...m, { role: "ai", text: `Chat gagal: ${err instanceof Error ? err.message : "backend tidak merespons"}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    await sendText(input);
  }

  return (
    <main className="voice-only">
      <div className={listening ? "shader-frame listening" : loading ? "shader-frame thinking" : "shader-frame"} onPointerMove={(e) => rippleOrb(e.nativeEvent.offsetX / e.currentTarget.clientWidth, e.nativeEvent.offsetY / e.currentTarget.clientHeight)}>
        <iframe ref={orbFrameRef} src="/orb/index.html" title="" aria-hidden="true" />
        <button onClick={listen} type="button" disabled={loading} aria-label="Bicara dengan Anta" />
      </div>
      <div className="subtitle-live">{subtitle}</div>
    </main>
  );
}
