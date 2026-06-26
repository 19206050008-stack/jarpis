"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

type Message = { role: "user" | "ai"; text: string };
type View = { title: string; url: string; note: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: { [key: number]: { [key: number]: { transcript?: string } } } }) => void) | null;
  start: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function saveMessage(role: string, text: string) {
  if (!supabase) return;
  await supabase.from("chat_messages").insert({ role, content: text });
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function searchUrl(kind: string, query: string, apiUrl: string) {
  const q = encodeURIComponent(query);
  if (kind === "berita") return `${apiUrl}/news?q=${q}`;
  if (kind === "lagu") return `${apiUrl}/videos?q=${q}`;
  return `${apiUrl}/proxy?url=${q}`;
}

function quickAck(text: string) {
  const lower = text.toLowerCase();
  if (/^(halo|hai|hello|pagi|siang|malam)\b/.test(lower)) return "Halo. Saya siap. Mau saya bantu apa dulu?";
  if (lower.startsWith("/berita")) return "Baik, saya cari berita terbaru. Setelah muncul, saya bisa bantu ringkas atau bacakan.";
  if (lower.startsWith("/lagu")) return "Baik, saya cari lagu/video yang cocok. Sebentar.";
  if (lower.startsWith("/gambar")) return "Baik, saya cari gambar yang relevan. Sebentar.";
  if (lower.startsWith("/buka")) return "Baik, saya buka websitenya di monitor.";
  return "Baik, saya proses. Saya akan jawab singkat lalu tanya langkah berikutnya.";
}

async function askAi(text: string) {
  const cached = localStorage.getItem(`jarpis:${text}`);
  if (cached) return cached;
  const prompt = `Kamu Jarpis, asisten AI penulisan novel berbahasa Indonesia. Jawab ringkas, praktis, dan berguna. Akhiri dengan satu pertanyaan lanjutan yang relevan.\n\nUser: ${text}`;
  const url = `https://text.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=openai`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("AI tidak menjawab");
  const answer = await res.text();
  localStorage.setItem(`jarpis:${text}`, answer.slice(0, 4000));
  return answer;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Jarpis online. Masukkan perintah suara atau teks melalui ikon di sekeliling saya." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ title: "", url: "", note: "" });
  const [videos, setVideos] = useState<{ id: string; title: string; url: string }[]>([]);
  const [news, setNews] = useState<{ title: string; link: string; source: string; pubDate?: string }[]>([]);
  
  // Popup States: 'closed' | 'open' | 'minimized'
  const [chatState, setChatState] = useState<'closed' | 'open' | 'minimized'>('open');
  const [viewerState, setViewerState] = useState<'closed' | 'open' | 'minimized'>('closed');
  
  // Audio States
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [speaker, setSpeaker] = useState("sari");
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [listening, setListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  const voices = useMemo(() => [
    { id: "sari", label: "Sari — Wanita" },
    { id: "dewi", label: "Dewi — Wanita" },
    { id: "ayu", label: "Ayu — Wanita" },
    { id: "rina", label: "Rina — Wanita" },
    { id: "maya", label: "Maya — Wanita" },
    { id: "budi", label: "Budi — Pria" },
    { id: "agus", label: "Agus — Pria" },
    { id: "bayu", label: "Bayu — Pria" },
    { id: "dimas", label: "Dimas — Pria" },
    { id: "andi", label: "Andi — Pria" },
  ], []);

  // Realtime, lightweight Web Audio analyser for the Jarvis orb.
  useEffect(() => {
    const el = audioRef.current;
    const orb = orbRef.current;
    if (!el || !orb || !audioUrl) return;

    let raf = 0;
    let source: MediaElementAudioSourceNode | null = null;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128; // ponytail: small FFT, enough for visual feedback.
    analyser.smoothingTimeConstant = 0.75;

    try {
      source = audioContext.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
    } catch (err) {
      console.error("Audio analyser failed", err);
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const avg = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] || 0;
      return sum / Math.max(1, to - from) / 255;
    };

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bass = avg(0, 8);
      const mid = avg(8, 24);
      const high = avg(24, data.length);
      const energy = Math.max(bass, mid, high);

      orb.style.setProperty("--bass", String(1 + bass * 0.45));
      orb.style.setProperty("--mid", String(1 + mid * 0.35));
      orb.style.setProperty("--high", String(1 + high * 0.25));
      orb.style.setProperty("--glow", String(35 + energy * 90));
      setIsAiSpeaking(!el.paused && !el.ended);

      if (!el.paused && !el.ended) raf = requestAnimationFrame(tick);
    };

    const start = async () => {
      await audioContext.resume();
      setIsAiSpeaking(true);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      setIsAiSpeaking(false);
      cancelAnimationFrame(raf);
      orb.style.setProperty("--bass", "1");
      orb.style.setProperty("--mid", "1");
      orb.style.setProperty("--high", "1");
      orb.style.setProperty("--glow", "35");
    };

    el.addEventListener("play", start);
    el.addEventListener("pause", stop);
    el.addEventListener("ended", stop);
    if (!el.paused) void start();

    return () => {
      el.removeEventListener("play", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("ended", stop);
      cancelAnimationFrame(raf);
      source?.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [audioUrl]);

  async function handle(text: string) {
    const lower = text.toLowerCase();
    const parts = text.split(/\s+/);
    const cmd = parts[0].replace("/", "");
    const rest = text.slice(parts[0].length).trim();

    setVideos([]);
    setNews([]);

    // /buka website
    if (["buka", "open"].includes(cmd) && rest) {
      const targetUrl = withProtocol(rest);
      const proxied = `${apiUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
      setView({ title: `Buka: ${rest}`, url: proxied, note: "Website dimuat via Jarpis Secure Proxy." });
      setViewerState('open');
      return `Saya membuka website ${rest} di panel kanan.`;
    }

    // /berita
    if (cmd === "berita" && rest) {
      try {
        const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(rest)}`);
        if (res.ok) {
          const list = await res.json();
          setNews(list);
          setView({ title: `Berita: ${rest}`, url: "", note: "Menampilkan 10 berita terhangat." });
          setViewerState('open');
          return `Oke, akan saya cari berita tentang ${rest}. Apakah kamu ingin saya membacakan atau melihat berita yang sudah muncul?`;
        }
      } catch (err) {
        console.error("News fetch error", err);
      }
      return `Maaf, saya gagal mencari berita tentang ${rest}.`;
    }

    // /lagu / musik
    if (cmd === "lagu" && rest) {
      try {
        const res = await fetch(`${apiUrl}/videos?q=${encodeURIComponent(rest)}`);
        if (res.ok) {
          const list = await res.json();
          setVideos(list);
          setView({ title: `Lagu/Video: ${rest}`, url: "", note: "Pilih video untuk diputar langsung di panel." });
          setViewerState('open');
          return `Oke, saya carikan lagu/video tentang ${rest}. Apakah kamu ingin saya membacakan atau melihat lagu yang sudah muncul?`;
        }
      } catch (err) {
        console.error("Video fetch error", err);
      }
      return `Maaf, saya gagal mencari video tentang ${rest}.`;
    }

    // /cari / web
    if (["cari", "web", "gambar"].includes(cmd) && rest) {
      const kind = cmd === "cari" || cmd === "web" ? "web" : cmd;
      const targetUrl = searchUrl(kind, rest, apiUrl);
      setView({ title: `${kind.toUpperCase()}: ${rest}`, url: targetUrl, note: "Pencarian dimuat via Jarpis Secure Proxy." });
      setViewerState('open');
      return `Oke, saya carikan ${kind} tentang ${rest}. Apakah kamu ingin saya membacakan atau melihat hasil yang sudah muncul?`;
    }

    // normal chat
    return askAi(text);
  }

  function startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setInput("Browser ini belum mendukung voice input. Ketik perintah saja.");
      return;
    }
    const rec = new Recognition();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript || "";
      if (text) void send(text);
    };
    rec.start();
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setChatState('open');
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: quickAck(text) }]);
    await saveMessage("user", text);

    try {
      const answer = await handle(text);
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: answer } : msg)));
      await saveMessage("ai", answer);

      if (speakEnabled && apiUrl) {
        try {
          const speakRes = await fetch(`${apiUrl}/speak`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: answer, speaker }),
          });
          if (speakRes.ok) {
            const blob = await speakRes.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
          }
        } catch (ttsErr) {
          console.error("TTS failed", ttsErr);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error tidak diketahui";
      setMessages((m) => m.map((item, i) => (i === m.length - 1 ? { role: "ai", text: msg } : item)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="jarvis-desktop">
      {/* Background Equalizer Visualizer */}
      <div className="center-container">
        <div ref={orbRef} className={`orb-equalizer ${isAiSpeaking ? 'active' : ''}`}>
          <div className="ring ring-1"></div>
          <div className="ring ring-2"></div>
          <div className="ring ring-3"></div>
          <div className="ring ring-4"></div>
          <div className="core"></div>
        </div>
      </div>

      {/* Floating System Dock (Icons only) */}
      <nav className="dock">
        <button className={chatState === 'open' ? 'active' : ''} onClick={() => setChatState(chatState === 'open' ? 'minimized' : 'open')} title="AI Chat">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button className={viewerState === 'open' ? 'active' : ''} onClick={() => setViewerState(viewerState === 'open' ? 'minimized' : 'open')} title="Website Viewer">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        </button>
        <div className="divider"></div>
        <button className={listening ? 'active' : ''} onClick={startVoiceInput} title="Perintah Suara">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
        </button>
        <button onClick={() => setInput("/buka ")} title="Buka URL">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>
        <button onClick={() => setInput("/berita ")} title="Cari Berita">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M16 8h2M16 12h2M16 16h2M6 8h6v8H6z"></path></svg>
        </button>
        <button onClick={() => setInput("/gambar ")} title="Cari Gambar">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        </button>
        <button onClick={() => setInput("/lagu ")} title="Cari Lagu">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </button>
      </nav>

      {/* Popup 1: AI Chat */}
      {chatState !== 'closed' && (
        <section className={`popup-window chat-window ${chatState}`}>
          <header className="window-header">
            <span className="title">💬 Jarpis Chat</span>
            <div className="controls">
              <button onClick={() => setChatState('minimized')}>-</button>
              <button onClick={() => setChatState('closed')}>x</button>
            </div>
          </header>
          
          <div className="chat">
            {messages.map((msg, i) => <div key={i} className={`msg ${msg.role}`}>{msg.text}</div>)}
          </div>

          <form className="form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tanya Jarpis atau ketik /berita..." />
            <button disabled={loading || !input.trim()}>{loading ? "..." : "Kirim"}</button>
          </form>

          <div className="tts-dock">
            <label>
              <input type="checkbox" checked={speakEnabled} onChange={(e) => setSpeakEnabled(e.target.checked)} />
              Suara Aktif
            </label>
            <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </section>
      )}

      {/* Popup 2: Website & Media Viewer */}
      {viewerState !== 'closed' && (
        <section className={`popup-window viewer-window ${viewerState}`}>
          <header className="window-header">
            <span className="title">🌐 Jarpis Monitor: {view.title || "No Signal"}</span>
            <div className="controls">
              <button onClick={() => setViewerState('minimized')}>-</button>
              <button onClick={() => setViewerState('closed')}>x</button>
            </div>
          </header>
          <div className="viewer-content">
            {view.note && <p className="viewer-note">{view.note}</p>}
            
            {view.url && <iframe src={view.url} className="viewer-frame" title={view.title} />}
            
            {news.length > 0 && (
              <div className="news-list">
                {news.map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noreferrer" className="news-item">
                    <h4>{item.title}</h4>
                    <span>{item.source} • {item.pubDate}</span>
                  </a>
                ))}
              </div>
            )}

            {videos.length > 0 && (
              <div className="video-grid">
                {videos.map((vid, i) => (
                  <div key={i} className="video-item">
                    <iframe src={vid.url} title={vid.title} allowFullScreen />
                    <h5>{vid.title}</h5>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Hidden Audio Player for TTS */}
      {audioUrl && <audio key={audioUrl} ref={audioRef} src={audioUrl} autoPlay style={{ display: "none" }} />}
    </main>
  );
}
