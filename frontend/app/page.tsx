"use client";

import { FormEvent, useEffect, useRef, useState, useCallback } from "react";
import Menu from "./components/menu/Menu";
import OrbShader from "./components/OrbShader";

type Message = { role: "user" | "ai"; text: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror?: ((event: any) => void) | null;
  start(): void;
  stop(): void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws/chat";
const idleText = "Ketuk orb lalu bicara";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";
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
  const [subtitle, setSubtitle] = useState(idleText);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [orbColors, setOrbColors] = useState<{ color1: number[]; color2: number[]; color3: number[] }>({
    color1: [1.0, 0.70, 0.16], color2: [1.0, 0.46, 0.18], color3: [0.55, 0.16, 0.48]
  });
  const [orbAudio, setOrbAudio] = useState({ bass: 0, mid: 0, treble: 0, overall: 0 });
  const [orbRipple, setOrbRipple] = useState(false);
  const [orbRipplePos, setOrbRipplePos] = useState({ x: 0.5, y: 0.5 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const shaderFrameRef = useRef<HTMLDivElement>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const userActionRef = useRef(false);
  const speakingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = shaderFrameRef.current;
    if (!el) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        const rect = el.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        triggerRipple(x, y);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        const rect = el.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        triggerRipple(x, y);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  useEffect(() => {
    fetch(`${apiUrl}/chat/history?session_id=${sessionId()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => Array.isArray(rows) && rows.length && setMessages(rows))
      .catch(() => {});

    introTimerRef.current = setTimeout(() => {
      if (userActionRef.current) return;
      playTemplate("Pembuka", () => {
        if (!userActionRef.current) setSubtitle(idleText);
      }, () => !userActionRef.current).then((audio) => { introAudioRef.current = audio; });
    }, 3000);

    return () => cancelIntro(false);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "anta-close-menu") return;
      setMenuOpen(false);
      (event.source as Window | null)?.postMessage({ type: "anta-menu-closed" }, "*");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Sync orb color when voiceState changes
  useEffect(() => {
    const colorMap: Record<VoiceState, { color1: number[]; color2: number[]; color3: number[] }> = {
      idle: { color1: [1.0, 0.70, 0.16], color2: [1.0, 0.46, 0.18], color3: [0.55, 0.16, 0.48] },
      listening: { color1: [0.2, 0.7, 1.0], color2: [0.1, 0.9, 0.95], color3: [0.3, 0.4, 1.0] },
      thinking: { color1: [0.6, 0.3, 1.0], color2: [0.8, 0.4, 0.9], color3: [0.4, 0.15, 0.8] },
      speaking: { color1: [0.2, 1.0, 0.6], color2: [0.4, 0.95, 0.8], color3: [0.1, 0.8, 0.5] },
    };
    setOrbColors(colorMap[voiceState]);
  }, [voiceState]);

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
    const url = URL.createObjectURL(await res.blob());
    if (!active()) { URL.revokeObjectURL(url); return null; }
    const audio = new Audio(url);
    audio.onplay = () => { setVoiceState("speaking"); audioOrb(audio); if (templateText) syncSubtitle(templateText, audio); };
    audio.onended = () => { setSubtitle(idleText); setVoiceState("idle"); URL.revokeObjectURL(url); onEnd?.(); };
    await audio.play().catch(() => URL.revokeObjectURL(url));
    return audio;
  }

  function triggerRipple(x = 0.5, y = 0.5) {
    setOrbRipplePos({ x, y });
    setOrbRipple(true);
    setTimeout(() => setOrbRipple(false), 50);
  }

  function syncSubtitle(text: string, audio: HTMLAudioElement) {
    setSubtitle("");
    const tick = () => {
      if (audio.paused || audio.ended) return;
      if (audio.currentTime < 0.08) { setSubtitle(""); requestAnimationFrame(tick); return; }
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
      if (audio.paused || audio.ended) { ctx.close().catch(() => {}); setAudioLevel(0); setOrbAudio({ bass: 0, mid: 0, treble: 0, overall: 0 }); return; }
      analyser.getByteFrequencyData(data);
      const avg = (from: number, to: number) => data.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from) / 255;
      const bass = avg(0, 10);
      const mid = avg(10, 32);
      const treble = avg(32, data.length);
      const overall = avg(0, data.length);
      setAudioLevel(overall);
      setOrbAudio({ bass, mid, treble, overall });
      requestAnimationFrame(tick);
    };
    tick();
  }

  async function speak(text: string) {
    if (!tts) {
      // ponytail: karaoke-style word reveal when TTS is disabled
      setVoiceState("speaking");
      const words = text.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        setSubtitle(words.slice(0, i + 1).join(" "));
        await new Promise((r) => setTimeout(r, Math.min(180, 2500 / words.length)));
      }
      await new Promise((r) => setTimeout(r, 1000));
      setSubtitle(idleText);
      setVoiceState("idle");
      return;
    }
    // ponytail: stream audio directly from URL — play starts as soon as first bytes arrive,
    // no need to wait for full blob download. Saves 1-3s on longer responses.
    const audio = new Audio();
    speakingAudioRef.current = audio;
    audio.preload = "auto";
    audio.src = `${apiUrl}/speak-kira-stream?text=${encodeURIComponent(text.slice(0, 500))}&speaker=${encodeURIComponent(voice)}&t=${Date.now()}`;
    
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Fallback: if stream endpoint doesn't exist, use POST blob method
        fetchAndPlayBlob(text, resolve);
      }, 500);

      audio.oncanplay = () => {
        clearTimeout(timeout);
      };
      audio.onplay = () => {
        clearTimeout(timeout);
        audioOrb(audio);
        syncSubtitle(text, audio);
      };
      audio.onended = () => {
        speakingAudioRef.current = null;
        setSubtitle(idleText);
        setVoiceState("idle");
        resolve();
      };
      audio.onerror = () => {
        clearTimeout(timeout);
        // Fallback to blob method if stream fails
        fetchAndPlayBlob(text, resolve);
      };
      audio.play().catch(() => {
        clearTimeout(timeout);
        fetchAndPlayBlob(text, resolve);
      });
    });
  }

  async function fetchAndPlayBlob(text: string, resolve: () => void) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${apiUrl}/speak-kira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 500), speaker: voice }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("TTS gagal");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      speakingAudioRef.current = audio;
      audio.onplay = () => { audioOrb(audio); syncSubtitle(text, audio); };
      audio.onended = () => {
        speakingAudioRef.current = null;
        setSubtitle(idleText);
        setVoiceState("idle");
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => {
        speakingAudioRef.current = null;
        URL.revokeObjectURL(url);
        setVoiceState("idle");
        setSubtitle(idleText);
        resolve();
      });
    } catch {
      speakingAudioRef.current = null;
      setSubtitle(idleText);
      setVoiceState("idle");
      resolve();
    } finally {
      clearTimeout(timer);
    }
  }

  // ponytail: interrupt TTS when user wants to speak again
  function interruptSpeaking() {
    if (speakingAudioRef.current) {
      speakingAudioRef.current.pause();
      speakingAudioRef.current.currentTime = 0;
      speakingAudioRef.current = null;
    }
  }

  function playClickSound() {
    if (listening) return;
    // ponytail: haptic feedback on mobile for tactile confirmation
    navigator.vibrate?.(30);
    const audio = new Audio("/audio/orb-water-click.mp3");
    audio.volume = 0.35;
    audio.play().catch(() => {});
  }

  function handlePointer(clientX: number, clientY: number, target: HTMLDivElement) {
    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    triggerRipple(x, y);
  }

  function listen() {
    // Case: user taps while AI is speaking → interrupt and listen
    if (voiceState === "speaking") {
      interruptSpeaking();
      setVoiceState("idle");
      setSubtitle(idleText);
      // Small delay then start listening
      setTimeout(() => listenCore(), 200);
      return;
    }
    // Case: user taps while thinking → show feedback, don't start mic
    if (loading) {
      setSubtitle("Tunggu sebentar, Anta sedang berpikir...");
      setTimeout(() => { if (loading) setSubtitle("Masih memproses..."); }, 2000);
      return;
    }
    // Case: already listening (double tap) → ignore
    if (listening) return;
    listenCore();
  }

  function listenCore() {
    cancelIntro();
    playClickSound();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSubtitle("Browser belum mendukung voice input."); setVoiceState("idle"); return; }
    const rec = new SR();
    recognitionRef.current = rec;
    let sent = false;
    let lastText = "";
    let heardAny = false;
    let timedOut = false;
    const silenceTimer = setTimeout(() => {
      if (heardAny || sent) return;
      timedOut = true;
      setSubtitle("Tidak terdengar. Ketuk orb lagi.");
      setVoiceState("idle");
      try { rec.stop(); } catch {}
      setTimeout(() => setSubtitle(idleText), 2000);
    }, 8000);
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      text = text.trim();
      if (!text) return;
      heardAny = true;
      clearTimeout(silenceTimer);
      lastText = text;
      setInput(text);
      setSubtitle(text);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal && !sent) {
        sent = true;
        sendText(text);
      }
    };
    rec.onerror = (event) => {
      clearTimeout(silenceTimer);
      const err = event?.error === "not-allowed" ? "Izin mikrofon ditolak. Cek pengaturan browser." : "Suara belum tertangkap. Ketuk orb lagi.";
      setSubtitle(err);
      setListening(false);
      setVoiceState("idle");
      recognitionRef.current = null;
      setTimeout(() => setSubtitle(idleText), 2500);
    };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      setListening(false);
      setAudioLevel(0);
      recognitionRef.current = null;
      if (!lastText && !sent && !timedOut) { setSubtitle(idleText); setVoiceState("idle"); }
      if (lastText && !sent) {
        sent = true;
        sendText(lastText);
      }
    };
    setSubtitle("Mendengar...");
    setVoiceState("listening");
    triggerRipple();
    setListening(true);
    try {
      rec.start();
    } catch {
      clearTimeout(silenceTimer);
      setListening(false);
      setVoiceState("idle");
      recognitionRef.current = null;
      setSubtitle("Voice input belum siap. Coba lagi.");
      setTimeout(() => setSubtitle(idleText), 2000);
    }
  }

  const handleMenuClose = useCallback(() => { setMenuOpen(false); setMenuCardId(null); }, []);

  function openSpotify() {
    window.open("https://open.spotify.com", "_blank", "noopener,noreferrer");
  }

  function openMenu(cardId?: string) {
    setMenuCardId(cardId || null);
    setMenuOpen(true);
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

  // ponytail: play pre-recorded template audio (instant, no generation delay)
  async function playQuickResponse(category: string): Promise<void> {
    try {
      const res = await fetch(`${apiUrl}/speak-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, timestamp: Date.now() }),
      });
      if (!res.ok) return;
      const encoded = res.headers.get("x-anta-text");
      const templateText = encoded
        ? decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))))
        : "";
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      speakingAudioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onplay = () => { audioOrb(audio); if (templateText) syncSubtitle(templateText, audio); };
        audio.onended = () => {
          speakingAudioRef.current = null;
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
      });
    } catch {
      // silent fail — pre-recorded is optional enhancement
    }
  }

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setVoiceState("speaking");
    setSubtitle(text);
    setMessages((m) => [...m, { role: "user", text }]);

    if (/\b(buka|open)\b.*\b(menu|hud)\b|\b(menu|hud)\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "Menu saya buka." }]);
      setTimeout(() => openMenu(), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    if (/\b(buka|open)\b.*\bspotify\b|\bspotify\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "Spotify saya buka." }]);
      setTimeout(() => openMenu("music"), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    if (/\b(buka|open)\b.*\b(youtube|video)\b|\b(youtube|video)\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "YouTube saya buka." }]);
      setTimeout(() => openMenu("video"), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    if (/\b(buka|open)\b.*\b(notepad|catatan)\b|\b(notepad|catatan)\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "Notepad saya buka." }]);
      setTimeout(() => openMenu("notepad"), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    if (/\b(buka|open)\b.*\b(folder|berkas|file)\b|\b(folder|berkas|file)\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "Folder saya buka." }]);
      setTimeout(() => openMenu("folder"), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    if (/\b(buka|open)\b.*\bgoogle\b|\bgoogle\b.*\b(buka|open)\b/i.test(text)) {
      await playQuickResponse("Membuka aplikasi");
      setMessages((m) => [...m, { role: "ai", text: "Google saya buka." }]);
      setTimeout(() => openMenu("google"), 300);
      setLoading(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      return;
    }

    // Step 1: Langsung play "Menerima perintah" (instan) + paralel kirim ke backend
    const category = categoryFor(text);
    const [answer] = await Promise.all([
      askWs(text).then((a) => a.trim() || "Tidak ada jawaban.").catch((err) => {
        if (err instanceof Error && err.message.includes("timeout")) return "__ERROR_TIMEOUT__";
        if (err instanceof Error && err.message.includes("gagal")) return "__ERROR_GAGAL__";
        return "__ERROR__";
      }),
      playQuickResponse(category),
    ]);

    // Step 2: Handle result
    if (answer.startsWith("__ERROR")) {
      const friendly = answer === "__ERROR_TIMEOUT__"
        ? "Maaf, server lama merespons. Coba lagi."
        : answer === "__ERROR_GAGAL__"
        ? "Koneksi terputus. Coba lagi."
        : "Terjadi gangguan. Coba lagi.";
      setMessages((m) => [...m, { role: "ai", text: friendly }]);
      await playQuickResponse("Error / gagal");
      setSubtitle(idleText);
      setVoiceState("idle");
      setLoading(false);
      return;
    }

    // Step 3: Play "Hasil ditemukan" lalu bacakan jawaban
    setMessages((m) => [...m, { role: "ai", text: answer }]);
    await playQuickResponse("Hasil ditemukan");
    setVoiceState("speaking");
    await speak(answer);
    setLoading(false);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    await sendText(input);
  }

  return (
    <main className={`voice-only ${menuOpen ? "menu-active" : ""}`}>
      <div 
        ref={shaderFrameRef}
        className={`shader-frame ${menuOpen ? "shader-frame-mini" : ""} ${listening ? "listening" : loading ? "thinking" : ""}`}
        onPointerMove={(e) => handlePointer(e.clientX, e.clientY, e.currentTarget)}
      >
        <OrbShader
          size={240}
          colors={orbColors}
          audioData={orbAudio}
          onRipple={orbRipple}
          ripplePosition={orbRipplePos}
        />
        <button onClick={menuOpen ? handleMenuClose : listen} type="button" aria-label={menuOpen ? "Tutup menu" : "Bicara dengan Anta"} />
      </div>
      {!menuOpen && (
        <div className={`subtitle-live state-${voiceState}`}>{subtitle}</div>
      )}

      <Menu
        open={menuOpen}
        onClose={handleMenuClose}
        openCardId={menuCardId}
        subtitle={subtitle}
        subtitleState={`state-${voiceState}`}
      />

      <div 
        className={`aurora-wrap aurora-${voiceState}`}
        style={{
          "--aurora-scale": (1.0 + audioLevel * 2.8).toFixed(3),
          "--aurora-opacity": (voiceState === "listening" ? 0.9 : voiceState === "thinking" ? 0.8 : voiceState === "speaking" ? 0.85 : 0.4).toFixed(2)
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
