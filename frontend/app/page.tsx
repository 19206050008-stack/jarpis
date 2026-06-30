"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "ai"; text: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror?: ((event: any) => void) | null;
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
  const [orbSrc, setOrbSrc] = useState("/orb/index.html");
  const [audioLevel, setAudioLevel] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const orbFrameRef = useRef<HTMLIFrameElement>(null);
  const shaderFrameRef = useRef<HTMLDivElement>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const userActionRef = useRef(false);

  useEffect(() => {
    if (orbFrameRef.current) {
      orbFrameRef.current.setAttribute("allowtransparency", "true");
    }
  }, [orbSrc]);

  useEffect(() => {
    const el = shaderFrameRef.current;
    if (!el) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        const rect = el.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        rippleOrb(x, y);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        const rect = el.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        rippleOrb(x, y);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [orbSrc]);

  useEffect(() => {
    fetch(`${apiUrl}/chat/history?session_id=${sessionId()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => Array.isArray(rows) && rows.length && setMessages(rows))
      .catch(() => {});

    setOrbSrc(`/orb/index.html?v=${Date.now()}`);

    introTimerRef.current = setTimeout(() => {
      if (userActionRef.current) return;
      playTemplate("Pembuka", () => {
        if (!userActionRef.current) setSubtitle("Ketuk orb lalu bicara");
      }, () => !userActionRef.current).then((audio) => { introAudioRef.current = audio; });
    }, 3000);

    return () => cancelIntro(false);
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

  function cancelIntro(markAction = true) {
    if (markAction) userActionRef.current = true;
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    introAudioRef.current?.pause();
    introAudioRef.current = null;
  }

  async function playTemplate(category: string, onEnd?: () => void, active = () => true) {
    const res = await fetch(`${apiUrl}/speak-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, timestamp: Date.now() }),
    }).catch(() => null);
    if (!res?.ok || !active()) return null;
    const encoded = res.headers.get("x-anta-text");
    const templateText = encoded
      ? decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))))
      : category.toLowerCase() === "pembuka" ? "Halo, Bos. Anta sudah aktif dan siap membantu pekerjaanmu." : "";
    if (templateText) setSubtitle(templateText);
    const url = URL.createObjectURL(await res.blob());
    if (!active()) { URL.revokeObjectURL(url); return null; }
    const audio = new Audio(url);
    audio.onplay = () => { audioOrb(audio); if (templateText) syncSubtitle(templateText, audio); };
    audio.onended = () => { if (templateText) setSubtitle(templateText); URL.revokeObjectURL(url); onEnd?.(); };
    await audio.play().catch(() => URL.revokeObjectURL(url));
    return audio;
  }

  function fixOrbFrame() {
    const win = orbFrameRef.current?.contentWindow;
    if (!win) return;
    setTimeout(() => win.dispatchEvent(new Event("resize")), 100);
    setTimeout(() => win.dispatchEvent(new Event("resize")), 500);
  }

  function rippleOrb(x = 0.5, y = 0.5) {
    orbFrameRef.current?.contentWindow?.postMessage({ type: "anta-ripple", nx: x, ny: y }, "*");
  }

  function syncSubtitle(text: string, audio: HTMLAudioElement) {
    setSubtitle("");
    const tick = () => {
      if (audio.paused || audio.ended) return;
      const fallback = Math.max(2, text.length * 0.055);
      const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallback;
      setSubtitle(text.slice(0, Math.max(1, Math.ceil((audio.currentTime / total) * text.length))));
      requestAnimationFrame(tick);
    };
    tick();
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
      if (audio.paused || audio.ended) { ctx.close().catch(() => {}); setAudioLevel(0); return; }
      analyser.getByteFrequencyData(data);
      const avg = (from: number, to: number) => data.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from) / 255;
      const overall = avg(0, data.length);
      setAudioLevel(overall);
      orbFrameRef.current?.contentWindow?.postMessage({ type: "anta-audio", bass: avg(0, 10), mid: avg(10, 32), treble: avg(32, data.length), overall }, "*");
      requestAnimationFrame(tick);
    };
    tick();
  }

  async function speak(text: string) {
    setSubtitle(text);
    if (!tts) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${apiUrl}/speak-kira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 500), speaker: voice }),
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onplay = () => { audioOrb(audio); syncSubtitle(text, audio); };
      audio.onended = () => { setSubtitle(text); URL.revokeObjectURL(url); };
      await audio.play().catch(() => URL.revokeObjectURL(url));
    } catch {
      // ponytail: TTS provider can stall; text answer must not stall with it.
      setSubtitle(text);
    } finally {
      clearTimeout(timer);
    }
  }

  function playClickSound() {
    if (listening) return;
    const audio = new Audio("/audio/orb-water-click.mp3");
    audio.volume = 0.35;
    audio.play().catch(() => {});
  }

  function handlePointer(clientX: number, clientY: number, target: HTMLDivElement) {
    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    rippleOrb(x, y);
  }

  function listen() {
    if (listening) return;
    cancelIntro();
    playClickSound();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung voice input.");
    const rec = new SR();
    let sent = false;
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;
    
    // Create local AudioContext for microphone reactivity
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    let micCtx: AudioContext | null = null;
    let micStream: MediaStream | null = null;
    let micTimer: ReturnType<typeof setInterval> | null = null;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      micStream = stream;
      if (!AC) return;
      micCtx = new AC();
      const src = micCtx.createMediaStreamSource(stream);
      const analyser = micCtx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      micTimer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setAudioLevel(avg);
      }, 50);
    }).catch(() => {});

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
    rec.onerror = () => {
      setSubtitle("Mic gagal. Izinkan mikrofon lalu coba lagi.");
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      if (micTimer) clearInterval(micTimer);
      if (micCtx) micCtx.close().catch(() => {});
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      setAudioLevel(0);
    };
    setSubtitle("Mendengar...");
    rippleOrb();
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setSubtitle("Voice input belum siap. Coba ketuk orb lagi.");
    }
  }

  function openSpotify() {
    window.open("https://open.spotify.com", "_blank", "noopener,noreferrer");
  }

  function openMenu() {
    window.location.href = "/menu";
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

    if (/\b(buka|open)\b.*\b(menu|hud)\b|\b(menu|hud)\b.*\b(buka|open)\b/i.test(text)) {
      const answer = "Menu saya buka.";
      setSubtitle(answer);
      setMessages((m) => [...m, { role: "ai", text: answer }]);
      await speak(answer);
      setTimeout(openMenu, 600);
      setLoading(false);
      return;
    }

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
      speak(answer);
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
      <div 
        ref={shaderFrameRef}
        className={listening ? "shader-frame listening" : loading ? "shader-frame thinking" : "shader-frame"} 
        onPointerMove={(e) => handlePointer(e.clientX, e.clientY, e.currentTarget)}
      >
        <iframe ref={orbFrameRef} src={orbSrc} onLoad={fixOrbFrame} title="" aria-hidden="true" style={{ background: "transparent" }} />
        <button onClick={listen} type="button" disabled={loading} aria-label="Bicara dengan Anta" />
      </div>
      <div className="subtitle-live">{subtitle}</div>

      <div 
        className="aurora-wrap"
        style={{
          "--aurora-scale": (1.0 + audioLevel * 2.8).toFixed(3),
          "--aurora-opacity": (listening ? 0.9 : loading ? 0.75 : 0.45).toFixed(2)
        } as any}
      >
        <section id="one">
          <section id="two">
            <section id="three">
              <section id="four">
                <section id="five" />
              </section>
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}
