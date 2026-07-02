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
  const [liveMode, setLiveMode] = useState(false);
  const [subtitle, setSubtitle] = useState(idleText);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const [extraMenuCard, setExtraMenuCard] = useState<any>(null);
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
  const loadingRef = useRef(false);
  const liveModeRef = useRef(false);
  const autoListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakingCleanupRef = useRef<(() => void) | null>(null);
  const lastUrlsRef = useRef<string[]>([]);
  const lastCommandRef = useRef({ text: "", time: 0 });
  const turnRef = useRef(0);

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

    return () => {
      cancelIntro(false);
      if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
    };
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

  function normalizedCommand(text: string) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

  function displaySubtitle(text: string) {
    return text
      .replace(/^(\s*)(\p{L})/u, (_, space, letter) => space + letter.toLocaleUpperCase("id-ID"))
      .replace(/\banta\b/gi, "Anta")
      .replace(/\bbos\b/gi, "Bos")
      .replace(/\byoutube\b/gi, "YouTube")
      .replace(/\bgoogle\b/gi, "Google")
      .replace(/\bspotify\b/gi, "Spotify");
  }

  function nextTurn() {
    if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
    autoListenTimerRef.current = null;
    turnRef.current += 1;
    return turnRef.current;
  }

  function isCurrentTurn(turn: number) {
    return turnRef.current === turn;
  }

  function setBusy(value: boolean) {
    loadingRef.current = value;
    setLoading(value);
  }

  function setLive(value: boolean) {
    liveModeRef.current = value;
    setLiveMode(value);
    if (!value && autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
    if (!value) autoListenTimerRef.current = null;
  }

  function scheduleLiveListen(turn: number) {
    if (!liveModeRef.current || !isCurrentTurn(turn) || loadingRef.current || listening) return;
    setSubtitle("Live aktif. Bicara lagi...");
    autoListenTimerRef.current = setTimeout(() => {
      if (liveModeRef.current && isCurrentTurn(turn) && !loadingRef.current && !listening) listenCore();
    }, 700);
  }

  function isGreetingOnly(text: string) {
    const normalized = normalizedCommand(text);
    const words = normalized.split(" ").filter(Boolean);
    if (!words.length || words.length > 3) return false;
    const greetings = new Set(["halo", "hallo", "hai", "hello", "helo", "hi", "pagi", "siang", "sore", "malam"]);
    const fillers = new Set(["anta", "bos", "boss"]);
    return greetings.has(words[0]) && words.slice(1).every((w) => fillers.has(w));
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
    const tick = () => {
      if (audio.paused || audio.ended) return;
      if (audio.currentTime < 0.08) { requestAnimationFrame(tick); return; }
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

  function speechTextFor(text: string) {
    const clean = text
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[*_`#>]/g, "")
      .split(/\n+/)
      .map((line) => line.replace(/^\s*[-*\d]+[.)-]?\s*/, "").trim())
      .filter(Boolean)
      .join(". ")
      .replace(/\s+/g, " ")
      .trim();
    const titles = text
      .replace(/https?:\/\/\S+/gi, "")
      .split(/\n+/)
      .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
      .filter(Boolean);
    if (/https?:\/\//i.test(text)) {
      if (!titles.length) return "Saya menemukan beberapa tautan, Bos. Detailnya sudah Anta tampilkan di layar.";
      return `Saya menemukan ${Math.min(titles.length, 3)} hasil, Bos. ${titles.slice(0, 2).join(". ")}. Mau saya buka salah satunya?`;
    }
    if (clean.length <= 260) return clean || text;
    const parts = clean.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) || [clean];
    let brief = parts.slice(0, 2).join(" ");
    if (brief.length > 220) brief = `${brief.slice(0, 217).replace(/\s+\S*$/, "")}...`;
    return `Intinya begini, Bos. ${brief} Kalau mau, saya lanjutkan detailnya.`;
  }

  async function speak(text: string, turn = turnRef.current) {
    if (!tts) {
      // ponytail: karaoke-style word reveal when TTS is disabled
      setVoiceState("speaking");
      const words = text.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if (!isCurrentTurn(turn)) return;
        setSubtitle(words.slice(0, i + 1).join(" "));
        await new Promise((r) => setTimeout(r, Math.min(180, 2500 / words.length)));
      }
      await new Promise((r) => setTimeout(r, 1000));
      if (!isCurrentTurn(turn)) return;
      setSubtitle(idleText);
      setVoiceState("idle");
      return;
    }
    await new Promise<void>((resolve) => playStreamOrBlob(text, resolve, turn));
  }

  async function playStreamOrBlob(text: string, resolve: () => void, turn: number) {
    const audio = new Audio();
    let done = false;
    let started = false;
    const streamUrl = `${apiUrl}/speak-kira-stream?text=${encodeURIComponent(text.slice(0, 500))}&speaker=${encodeURIComponent(voice)}&t=${Date.now()}`;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (speakingAudioRef.current === audio) speakingAudioRef.current = null;
      if (speakingCleanupRef.current === finish) speakingCleanupRef.current = null;
      resolve();
    }
    function fallback() {
      if (done || started) return;
      done = true;
      clearTimeout(timer);
      audio.pause();
      if (speakingAudioRef.current === audio) speakingAudioRef.current = null;
      if (speakingCleanupRef.current === finish) speakingCleanupRef.current = null;
      fetchAndPlayBlob(text, resolve, turn);
    }
    const timer = setTimeout(fallback, 1800);
    speakingAudioRef.current = audio;
    speakingCleanupRef.current = finish;
    audio.preload = "auto";
    audio.src = streamUrl;
    audio.onplaying = () => { started = true; clearTimeout(timer); };
    audio.onplay = () => { if (isCurrentTurn(turn)) { audioOrb(audio); syncSubtitle(text, audio); } };
    audio.onended = () => {
      if (isCurrentTurn(turn)) {
        setSubtitle(idleText);
        setVoiceState("idle");
      }
      finish();
    };
    audio.onerror = fallback;
    audio.play().catch(fallback);
  }

  async function fetchAndPlayBlob(text: string, resolve: () => void, turn: number) {
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
      if (!isCurrentTurn(turn)) { URL.revokeObjectURL(url); resolve(); return; }
      const audio = new Audio(url);
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        if (speakingAudioRef.current === audio) speakingAudioRef.current = null;
        if (speakingCleanupRef.current === finish) speakingCleanupRef.current = null;
        resolve();
      }
      speakingAudioRef.current = audio;
      speakingCleanupRef.current = finish;
      audio.onplay = () => { if (isCurrentTurn(turn)) { audioOrb(audio); syncSubtitle(text, audio); } };
      audio.onended = () => {
        if (isCurrentTurn(turn)) {
          setSubtitle(idleText);
          setVoiceState("idle");
        }
        finish();
      };
      audio.play().catch(() => {
        if (isCurrentTurn(turn)) {
          setVoiceState("idle");
          setSubtitle(idleText);
        }
        finish();
      });
    } catch {
      if (isCurrentTurn(turn)) {
        speakingAudioRef.current = null;
        setSubtitle(idleText);
        setVoiceState("idle");
      }
      resolve();
    } finally {
      clearTimeout(timer);
    }
  }

  // ponytail: interrupt TTS when user wants to speak again
  function interruptSpeaking() {
    if (speakingAudioRef.current) {
      speakingAudioRef.current.onended = null;
      speakingAudioRef.current.pause();
      speakingAudioRef.current.currentTime = 0;
      speakingAudioRef.current = null;
    }
    speakingCleanupRef.current?.();
    speakingCleanupRef.current = null;
    setAudioLevel(0);
    setOrbAudio({ bass: 0, mid: 0, treble: 0, overall: 0 });
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
    if (voiceState === "speaking" || speakingAudioRef.current) {
      nextTurn();
      interruptSpeaking();
      setBusy(false);
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
    const listenTurn = nextTurn();
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
      if (!isCurrentTurn(listenTurn)) return;
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
        setTimeout(() => { if (isCurrentTurn(listenTurn)) sendText(text); }, 450);
      }
    };
    rec.onerror = (event) => {
      if (!isCurrentTurn(listenTurn)) return;
      clearTimeout(silenceTimer);
      const err = event?.error === "not-allowed" ? "Izin mikrofon ditolak. Cek pengaturan browser." : "Suara belum tertangkap. Ketuk orb lagi.";
      setSubtitle(err);
      setListening(false);
      setVoiceState("idle");
      recognitionRef.current = null;
      setTimeout(() => setSubtitle(idleText), 2500);
    };
    rec.onend = () => {
      if (!isCurrentTurn(listenTurn)) return;
      clearTimeout(silenceTimer);
      setListening(false);
      setAudioLevel(0);
      recognitionRef.current = null;
      if (!lastText && !sent && !timedOut) { setSubtitle(idleText); setVoiceState("idle"); }
      if (lastText && !sent) {
        sent = true;
        setTimeout(() => { if (isCurrentTurn(listenTurn)) sendText(lastText); }, 450);
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

  function openTempWebCard(url: string, name = "Web", idPrefix = "web", logoUrl = "https://img.icons8.com/ios-filled/100/89f5ff/domain.png") {
    const id = `${idPrefix}-${Date.now()}`;
    const card = {
      id,
      name,
      category: "Web",
      description: url,
      logoUrl,
      type: "custom",
      url,
    };
    setExtraMenuCard(card);
    openMenu(id);
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
  async function playQuickResponse(category: string, turn = turnRef.current): Promise<void> {
    try {
      const res = await fetch(`${apiUrl}/speak-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, timestamp: Date.now() }),
      });
      if (!res.ok) return;
      if (!isCurrentTurn(turn)) return;
      const encoded = res.headers.get("x-anta-text");
      const templateText = encoded
        ? decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))))
        : "";
      const url = URL.createObjectURL(await res.blob());
      if (!isCurrentTurn(turn)) { URL.revokeObjectURL(url); return; }
      const audio = new Audio(url);
      speakingAudioRef.current = audio;
      await new Promise<void>((resolve) => {
        let done = false;
        function finish() {
          if (done) return;
          done = true;
          URL.revokeObjectURL(url);
          if (speakingAudioRef.current === audio) speakingAudioRef.current = null;
          if (speakingCleanupRef.current === finish) speakingCleanupRef.current = null;
          resolve();
        }
        speakingCleanupRef.current = finish;
        audio.onplay = () => { if (isCurrentTurn(turn)) { audioOrb(audio); if (templateText) syncSubtitle(templateText, audio); } };
        audio.onended = finish;
        audio.play().catch(finish);
      });
    } catch {
      // silent fail — pre-recorded is optional enhancement
    }
  }

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || loadingRef.current) return;
    const commandKey = normalizedCommand(text);
    const now = Date.now();
    if (commandKey && lastCommandRef.current.text === commandKey && now - lastCommandRef.current.time < 3000) return;
    lastCommandRef.current = { text: commandKey, time: now };
    const turn = nextTurn();
    interruptSpeaking();

    setInput("");
    setBusy(true);
    setVoiceState("thinking");
    setSubtitle(text);
    setMessages((m) => [...m, { role: "user", text }]);

    if (isGreetingOnly(text)) {
      const quick = playQuickResponse("Pembuka", turn);
      setMessages((m) => [...m, { role: "ai", text: "Halo, Bos. Anta siap." }]);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(tutup|close|keluar|kembali)\b/i.test(text) && /\b(menu|panel|halaman|google|youtube|spotify|notepad|folder)?\b/i.test(text)) {
      const reply = menuOpen ? "Saya tutup." : "Tidak ada halaman yang sedang terbuka.";
      if (menuOpen) {
        handleMenuClose();
        setExtraMenuCard(null);
      }
      setMessages((m) => [...m, { role: "ai", text: reply }]);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(reply);
      setTimeout(() => { if (isCurrentTurn(turn)) { setSubtitle(idleText); scheduleLiveListen(turn); } }, 1600);
      return;
    }

    const panelSearch = menuOpen && menuCardId ? text.match(/^(?:anta\s+)?(?:tolong\s+)?(?:cari|search)\s+(.+?)(?:\s+dong)?$/i) : null;
    if (panelSearch?.[1] && ["google", "video", "music"].includes(menuCardId || "")) {
      const q = panelSearch[1].trim();
      const quick = playQuickResponse("Loading / mencari", turn);
      if (menuCardId === "google") {
        setMessages((m) => [...m, { role: "ai", text: `Saya cari ${q} di Google. Kalau muncul verifikasi, login Google dulu ya.` }]);
        setTimeout(() => { if (isCurrentTurn(turn)) openTempWebCard(`https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`, "Google", "google-search", "https://img.icons8.com/color/100/google-logo.png"); }, 300);
      } else if (menuCardId === "video") {
        setMessages((m) => [...m, { role: "ai", text: `Saya cari ${q} di YouTube.` }]);
        setTimeout(() => { if (isCurrentTurn(turn)) openTempWebCard(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, "YouTube", "youtube-search", "https://img.icons8.com/ios-filled/100/ff0000/youtube-play.png"); }, 300);
      } else {
        const url = `https://open.spotify.com/search/${encodeURIComponent(q)}`;
        setMessages((m) => [...m, { role: "ai", text: `Saya buka pencarian Spotify untuk ${q}.` }]);
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    const openResult = text.match(/\b(buka|open)\b.*\b(hasil|nomor|no\.?|yang)?\s*(pertama|kedua|ketiga|1|2|3)\b/i);
    if (openResult && lastUrlsRef.current.length) {
      const idx = /kedua|2/i.test(openResult[0]) ? 1 : /ketiga|3/i.test(openResult[0]) ? 2 : 0;
      const url = lastUrlsRef.current[idx] || lastUrlsRef.current[0];
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Saya buka hasilnya." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openTempWebCard(url, `Hasil ${idx + 1}`); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    const googleSearch = text.match(/^\s*(buka|open)\s+google\s+(?:cari|search)?\s*(.+)$/i);
    if (googleSearch?.[2]) {
      const q = googleSearch[2].trim();
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: `Saya buka Google untuk ${q}. Kalau muncul verifikasi, login Google dulu ya.` }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openTempWebCard(`https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`, "Google", "google-search", "https://img.icons8.com/color/100/google-logo.png"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\b(menu|hud)\b|\b(menu|hud)\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Menu saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu(); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\bspotify\b|\bspotify\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Spotify saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu("music"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\b(youtube|video)\b|\b(youtube|video)\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "YouTube saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu("video"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\b(notepad|catatan)\b|\b(notepad|catatan)\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Notepad saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu("notepad"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\b(folder|berkas|file)\b|\b(folder|berkas|file)\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Folder saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu("folder"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    if (/\b(buka|open)\b.*\bgoogle\b|\bgoogle\b.*\b(buka|open)\b/i.test(text)) {
      const quick = playQuickResponse("Membuka aplikasi", turn);
      setMessages((m) => [...m, { role: "ai", text: "Google saya buka." }]);
      setTimeout(() => { if (isCurrentTurn(turn)) openMenu("google"); }, 300);
      setBusy(false);
      setVoiceState("idle");
      setSubtitle(idleText);
      await quick;
      scheduleLiveListen(turn);
      return;
    }

    const category = categoryFor(text);
    const [answer] = await Promise.all([
      askWs(text).then((a) => a.trim() || "Tidak ada jawaban.").catch((err) => {
        if (err instanceof Error && err.message.includes("timeout")) return "__ERROR_TIMEOUT__";
        if (err instanceof Error && err.message.includes("gagal")) return "__ERROR_GAGAL__";
        return "__ERROR__";
      }),
      category === "Loading / mencari" ? playQuickResponse(category, turn) : Promise.resolve(),
    ]);
    if (!isCurrentTurn(turn)) return;

    // Step 2: Handle result
    if (answer.startsWith("__ERROR")) {
      const friendly = answer === "__ERROR_TIMEOUT__"
        ? "Maaf, server lama merespons. Coba lagi."
        : answer === "__ERROR_GAGAL__"
        ? "Koneksi terputus. Coba lagi."
        : "Terjadi gangguan. Coba lagi.";
      setMessages((m) => [...m, { role: "ai", text: friendly }]);
      await playQuickResponse("Error / gagal", turn);
      if (!isCurrentTurn(turn)) return;
      setSubtitle(idleText);
      setVoiceState("idle");
      setBusy(false);
      scheduleLiveListen(turn);
      return;
    }

    lastUrlsRef.current = Array.from(answer.matchAll(/https?:\/\/\S+/gi), (m) => m[0].replace(/[),.]+$/, ""));

    setMessages((m) => [...m, { role: "ai", text: answer }]);
    setVoiceState("speaking");
    await speak(speechTextFor(answer), turn);
    if (isCurrentTurn(turn)) {
      setBusy(false);
      scheduleLiveListen(turn);
    }
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
        <button onClick={listen} type="button" aria-label="Bicara dengan Anta" />
      </div>
      {!menuOpen && (
        <div className={`subtitle-live state-${voiceState}`}>{displaySubtitle(subtitle)}</div>
      )}
      {!menuOpen && (
        <button
          className={`auto-listen-corner ${liveMode ? "active" : ""}`}
          onClick={() => setLive(!liveMode)}
          type="button"
          aria-pressed={liveMode}
          aria-label={liveMode ? "Matikan mode Live" : "Nyalakan mode Live"}
          title={liveMode ? "Live aktif" : "Live mati"}
        >
          LIVE
        </button>
      )}

      <Menu
        open={menuOpen}
        onClose={handleMenuClose}
        openCardId={menuCardId}
        subtitle={displaySubtitle(subtitle)}
        subtitleState={`state-${voiceState}`}
        extraCard={extraMenuCard}
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
