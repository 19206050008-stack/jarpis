"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties, type PointerEvent } from "react";
import { createClient } from "@supabase/supabase-js";

type Message = { role: "user" | "ai"; text: string };
type View = { title: string; url: string; note: string };

type LocalFile = { name: string; path: string; handle: FileSystemFileHandle };
type DirectoryHandle = FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>;

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
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

async function saveMessage(role: string, text: string) {
  if (!supabase) return;
  await supabase.from("chat_messages").insert({ role, content: text });
}

async function saveMemory(kind: string, content: string) {
  if (!supabase) return;
  await supabase.from("memories").insert({ kind, content }).then(() => {}, () => {});
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function searchUrl(kind: string, query: string, apiUrl: string) {
  const q = encodeURIComponent(query);
  if (kind === "berita") return `${apiUrl}/news?q=${q}`;
  if (kind === "lagu") return `${apiUrl}/videos?q=${q}`;
  if (kind === "gambar") return `${apiUrl}/proxy?url=${encodeURIComponent(`https://www.google.com/search?q=${q}&tbm=isch`)}`;
  return `${apiUrl}/proxy?url=${encodeURIComponent(`https://www.google.com/search?q=${q}`)}`;
}

function quickAck(text: string) {
  const lower = text.toLowerCase();
  if (/^(halo|hai|hello|pagi|siang|malam)\b/.test(lower)) return "Halo. Saya siap. Mau saya bantu apa dulu?";
  if (lower.startsWith("/berita")) return "Baik, saya cari berita terbaru. Setelah muncul, saya bisa bantu ringkas atau bacakan.";
  if (lower.startsWith("/lagu")) return "Baik, saya cari lagu/video yang cocok. Sebentar.";
  if (lower.startsWith("/gambar")) return "Baik, saya cari gambar yang relevan. Sebentar.";
  if (lower.includes("ganti suara") || lower.includes("ubah suara")) return "Baik, saya ganti suara Anta.";
  if (lower.startsWith("/buka")) return "Baik, saya buka websitenya di monitor.";
  return "Baik, saya proses. Saya akan jawab singkat lalu tanya langkah berikutnya.";
}

// Multiple free AI providers - hybrid/parallel approach
async function askPollinations(prompt: string, model = "openai"): Promise<string> {
  const url = `https://text.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("Pollinations error");
  return res.text();
}

async function askPollinationsChat(prompt: string, model = "openai"): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai. Jangan gunakan markdown. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      model,
      stream: false
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error("Pollinations chat error");
  return res.text();
}

async function askAi(text: string, cache = true) {
  const key = `anta:${text}`;
  const cached = cache ? localStorage.getItem(key) : null;
  if (cached) return cached;
  
  const systemPrompt = `Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks.

User: ${text}`;

  // Race multiple providers - first valid response wins
  const providers = [
    askPollinations(systemPrompt, "openai"),
    askPollinationsChat(text, "mistral"),
    askPollinations(systemPrompt, "mistral"),
  ];

  let answer = "";
  try {
    // Use Promise.any - first one to resolve wins
    answer = await Promise.any(providers);
  } catch {
    // All failed, try one more time with a simple fallback
    try {
      answer = await askPollinations(systemPrompt, "command-r-plus");
    } catch {
      throw new Error("Semua AI provider gagal merespons");
    }
  }

  if (!answer || answer.length < 2) throw new Error("AI tidak menjawab");
  if (cache) localStorage.setItem(key, answer.slice(0, 4000));
  return answer;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Anta online. Apa yang ingin kamu diskusikan hari ini?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ title: "Anta HUD", url: "", note: "" });
  const [videos, setVideos] = useState<{ id: string; title: string; url: string }[]>([]);
  const [news, setNews] = useState<{ title: string; link: string; source: string; pubDate?: string }[]>([]);
  
  // Popup States: 'closed' | 'open' | 'minimized'
  const [chatState, setChatState] = useState<'closed' | 'open' | 'minimized'>('closed');
  const [viewerState, setViewerState] = useState<'closed' | 'open' | 'minimized'>('closed');
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [popupPos, setPopupPos] = useState({ chat: { x: 40, y: 40 }, viewer: { x: 0, y: 40 } });
  
  // Audio States
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [speaker, setSpeaker] = useState("andi");
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [subtitle, setSubtitle] = useState("Anta online.");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [orbMode, setOrbMode] = useState("idle");
  const [orbSide, setOrbSide] = useState("center");
  const [orbOffset, setOrbOffset] = useState({ x: 0, y: 0 });
  const [orbShake, setOrbShake] = useState(false);
  const [orbDragging, setOrbDragging] = useState(false);
  const [agentAccepted, setAgentAccepted] = useState(true); // default to true (hidden) to prevent layout shift / background check first
  const [showAgentBanner, setShowAgentBanner] = useState(false);

  useEffect(() => {
    // Read preference from localStorage
    if (localStorage.getItem("anta_agent_accepted") === "true") {
      setAgentAccepted(true);
      setShowAgentBanner(false);
      return;
    }
    
    // Test if backend already has active state from local-agent
    if (apiUrl) {
      fetch(`${apiUrl}/agent/state`)
        .then((r) => r.ok ? r.json() : null)
        .then((state) => {
          if (state && state.process && state.process !== "unknown") {
            // Agent is alive and reporting! Automatically accept and keep hidden
            localStorage.setItem("anta_agent_accepted", "true");
            setAgentAccepted(true);
            setShowAgentBanner(false);
          } else {
            // No active agent reporting. Show permission banner.
            setAgentAccepted(false);
            setShowAgentBanner(true);
          }
        })
        .catch(() => {
          // If fetch fails (backend or agent not run), don't show the banner unless they haven't accepted it before.
          // Since localStorage is checked above, if it gets here we show it.
          setAgentAccepted(false);
          setShowAgentBanner(true);
        });
    } else {
      // If no apiUrl, rely on localStorage setting to decide
      const accepted = localStorage.getItem("anta_agent_accepted") === "true";
      setAgentAccepted(accepted);
      setShowAgentBanner(!accepted);
    }
  }, [apiUrl]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, ox: 0, oy: 0 });
  const popupDragRef = useRef({ key: "", x: 0, y: 0, ox: 0, oy: 0 });
  const lastPinchRef = useRef(0);
  const ttsCacheRef = useRef(new Map<string, string>());
  const seenNewsRef = useRef(new Set<string>());
  const lastActiveAppRef = useRef("");

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

  function cleanText(text: string) {
    if (!text || text === "undefined" || text.includes("undefined")) return "";
    return text
      .replace(/\\+n/g, "\n") // replace \n, \\n, \\\n etc with real newline
      .replace(/\\+/g, "") // strip remaining backslashes
      .replace(/[\*\#\"`]/g, "") // strip markdown * # ` "
      .replace(/\/(?=[a-zA-Z])/g, "") // strip forward slash before letters (command-like)
      .trim();
  }

  async function speakLine(text: string) {
    const clean = cleanText(text);
    if (!clean) return;

    // instant visual trigger
    setIsAiSpeaking(true);
    
    // Auxiliary function to run when audio starts playing
    const playTypingEffect = () => {
      setSubtitle(""); 
      let i = 0;
      const words = clean.split(" ");
      const intervalTyping = setInterval(() => {
        if (i >= words.length) {
          clearInterval(intervalTyping);
          return;
        }
        setSubtitle((prev) => (prev ? prev + " " + words[i] : words[i]));
        i++;
      }, 180);

      // Store in ref or handle cleanup on stop/ended
      const cleanup = () => {
        clearInterval(intervalTyping);
        setSubtitle("");
        setIsAiSpeaking(false);
        if (audioRef.current) {
          audioRef.current.removeEventListener("ended", cleanup);
          audioRef.current.removeEventListener("pause", cleanup);
        }
      };
      
      // Let the subtitle stay fully visible until audio ends or pauses
      audioRef.current?.addEventListener("ended", cleanup);
      audioRef.current?.addEventListener("pause", cleanup);
    };

    if (!speakEnabled || !apiUrl) {
      // Offline fallback: play typing immediately
      playTypingEffect();
      setTimeout(() => {
        setIsAiSpeaking(false);
        setSubtitle("");
      }, Math.max(1500, clean.length * 60));
      return;
    }

    const key = `${speaker}:${clean}`;
    const cached = ttsCacheRef.current.get(key);
    if (cached) {
      setAudioUrl(cached);
      // Wait briefly for elements to mount and listen
      setTimeout(() => {
        playTypingEffect();
      }, 50);
      return;
    }

    try {
      const speakRes = await fetch(`${apiUrl}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 700), speaker }),
      });
      if (speakRes.ok) {
        const blob = await speakRes.ok ? await speakRes.blob() : null;
        if (!blob) {
          setIsAiSpeaking(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        ttsCacheRef.current.set(key, url);
        setAudioUrl(url);
        setTimeout(() => {
          playTypingEffect();
        }, 50);
      } else {
        setIsAiSpeaking(false);
      }
    } catch (ttsErr) {
      setIsAiSpeaking(false);
      console.error("TTS failed", ttsErr);
    }
  }

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
      // Let the typing animation finish naturally or reset.
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

  useEffect(() => {
    if (!apiUrl || !agentAccepted) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/agent/state`);
        if (res.ok) {
          const state = await res.json();
          if (state.process && state.process !== "unknown" && state.process !== lastActiveAppRef.current) {
            lastActiveAppRef.current = state.process;
            // Generate custom response based on the active app detected
            const phrase = await askAi(`Kamu Anta. User baru saja membuka/fokus ke aplikasi '${state.process}' (judul window: '${state.title}'). Buat satu kalimat sapaan cerdas dan humoris terkait hal ini secara spontan. Jangan pakai markdown/kutipan. Maksimal 1 kalimat.`, false);
            void speakLine(phrase);
          }
        }
      } catch (err) {
        console.error("Agent state poll failed", err);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [apiUrl, speaker, speakEnabled, agentAccepted]);

  useEffect(() => {
    if (loading || isAiSpeaking || listening) return;
    const modes = ["idle", "slime", "melt", "bounce", "spin", "fast", "creature"];
    const timer = window.setInterval(() => {
      setOrbMode(modes[Math.floor(Math.random() * modes.length)]);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [loading, isAiSpeaking, listening]);

  useEffect(() => {
    if (loading || isAiSpeaking || listening) return;
    const timer = window.setTimeout(async () => {
      let line = "";
      try {
        if (apiUrl) {
          // Fetch real news from Indonesia/Yogyakarta
          const location = "Yogyakarta OR Indonesia";
          const credible = "(site:kompas.com OR site:tempo.co OR site:detik.com OR site:tribunnews.com OR site:antaranews.com)";
          const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(`${location} berita terbaru ${credible}`)}`);
          const items = res.ok ? await res.json() : [];
          const item = items.find((x: { title?: string; link?: string; pubDate?: string }) => {
            if (!x.link || seenNewsRef.current.has(x.link)) return false;
            // Only accept news from last 24 hours
            if (x.pubDate) {
              const pubTime = new Date(x.pubDate).getTime();
              const now = Date.now();
              if (isNaN(pubTime) || now - pubTime > 24 * 60 * 60 * 1000) return false;
            }
            return true;
          });
          if (item?.link) {
            seenNewsRef.current.add(item.link);
            // Fetch full article content
            const article = await fetch(`${apiUrl}/article?url=${encodeURIComponent(item.link)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
            const content = (article?.text && !article?.error && article.text.length > 80) ? article.text : "";
            
            // If no valid content at all, skip — don't speak garbage
            if (!content && (!item.title || item.title.length < 15)) return;
            
            const source = item.source || (() => { try { return new URL(item.link).hostname.replace("www.", ""); } catch { return "media Indonesia"; } })();
            
            // If we have real content, summarize it. Otherwise use the title.
            const prompt = content
              ? `Kamu Anta, AI asisten. Rangkum berita berikut menjadi 2-3 kalimat ringkas dengan gaya natural seperti teman ngobrol. JANGAN tampilkan judul asli. Parafrase seluruhnya dengan kata-katamu sendiri. Di akhir tambahkan: "(Sumber: ${source})". Jangan pakai markdown.\n\nIsi berita: ${content.slice(0, 1200)}`
              : `Kamu Anta, AI asisten. Sampaikan berita dengan judul "${item.title}" dalam 2 kalimat dengan gaya santai seperti teman yang ngasih tau berita. Jangan tampilkan judul asli, parafrase dengan kata-katamu. Di akhir tambahkan: "(Sumber: ${source})". Jangan pakai markdown.`;
            line = await askAi(prompt, false);
            
            // Validate AI response — don't speak if it contains error indicators
            const lineLower = line.toLowerCase();
            if (lineLower.includes("javascript") || lineLower.includes("undefined") || lineLower.includes("error") || lineLower.includes("tidak ada narasi") || lineLower.includes("tidak bisa") || line.length < 20) {
              return; // Skip, don't speak
            }
            
            await saveMemory("idle_news", `${source} - ${line}`);
          } else {
            // No fresh news available, just do idle
            return; // Don't speak if no valid news
          }
        } else {
          return; // No API, don't speak
        }
      } catch {
        return; // Failed, don't speak
      }
      if (line && line.length > 20) {
        const modes = ["spin", "slime", "melt", "creature", "bounce"];
        setOrbMode(modes[Math.floor(Math.random() * modes.length)]);
        void speakLine(line);
      }
    }, 12000 + Math.floor(Math.random() * 28000));
    return () => window.clearTimeout(timer);
  }, [loading, isAiSpeaking, listening, speaker, speakEnabled, apiUrl]);

  async function scanDirectory(dir: DirectoryHandle, base = ""): Promise<LocalFile[]> {
    const out: LocalFile[] = [];
    for await (const [name, handle] of dir) {
      const path = base ? `${base}/${name}` : name;
      if (handle.kind === "file") out.push({ name, path, handle: handle as FileSystemFileHandle });
      if (handle.kind === "directory") out.push(...await scanDirectory(handle as DirectoryHandle, path));
    }
    return out;
  }

  async function askFolderPermission() {
    if (!window.showDirectoryPicker) return "Browser ini belum mendukung akses folder. Pakai Chrome/Edge desktop, atau nanti butuh local agent untuk mobile.";
    const dir = await window.showDirectoryPicker();
    const list = await scanDirectory(dir);
    setFiles(list);
    return `Izin folder diterima. Saya mengindeks ${list.length} file. Sekarang kamu bisa bilang: cari file nama-file.`;
  }

  async function openLocalFile(file: LocalFile) {
    const blob = await file.handle.getFile();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function openKnownApp(name: string) {
    const apps: Record<string, string> = {
      whatsapp: "whatsapp://",
      spotify: "spotify://",
      telegram: "tg://",
      youtube: "https://youtube.com",
      gmail: "mailto:",
      email: "mailto:",
      maps: "https://maps.google.com",
    };
    const key = Object.keys(apps).find((app) => name.toLowerCase().includes(app));
    if (!key) return "Saya belum bisa membuka aplikasi itu dari browser. Untuk aplikasi arbitrary perlu Anta Local Agent yang di-install di perangkat.";
    
    // Proactive AI response before opening
    const responseText = await askAi(`Kamu Anta. User meminta membuka aplikasi '${key || name}'. Buat satu kalimat respons spontan cerdas dan ramah terkait hal ini (misal untuk spotify tawarkan mendengarkan lagu, dll). Jangan gunakan markdown atau kutipan. Maksimal 1 kalimat.`, false);
    void speakLine(responseText);
    
    setTimeout(() => {
      window.location.href = apps[key!];
    }, 1500);

    return responseText;
  }

  function startOrbDrag(e: PointerEvent<HTMLDivElement>) {
    setOrbDragging(true);
    dragRef.current = { active: true, moved: false, x: e.clientX, y: e.clientY, ox: orbOffset.x, oy: orbOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveOrb(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    orbRef.current?.style.setProperty("--pull-x", String(Math.min(1.35, 1 + Math.abs(dx) / 420)));
    orbRef.current?.style.setProperty("--pull-y", String(Math.max(0.72, 1 - Math.abs(dx) / 900)));
    setOrbOffset({ x: drag.ox + dx, y: drag.oy + dy });
  }

  function stopOrbDrag(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current.active = false;
    setOrbDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    orbRef.current?.style.setProperty("--pull-x", "1");
    orbRef.current?.style.setProperty("--pull-y", "1");
    if (drag.moved) {
      // Cubit/drag: trigger AI response only if not speaking/loading and cooldown 8s
      const now = Date.now();
      if (!isAiSpeaking && !loading && now - lastPinchRef.current > 8000) {
        lastPinchRef.current = now;
        void askAi(`Kamu Anta. User baru saja menarik badan orb-mu seperti karet. Buat satu reaksi spontan lucu, pendek, tidak generik, jangan ulangi kalimat sebelumnya. Waktu: ${Date.now()}`, false).then(speakLine);
      }
    } else {
      // Tap: hanya visual shake, throttle 3 detik, tanpa AI call
      const now = Date.now();
      if (now - lastPinchRef.current > 3000) {
        lastPinchRef.current = now;
        setOrbShake(true);
        window.setTimeout(() => setOrbShake(false), 450);
      }
    }
  }

  function startPopupDrag(key: "chat" | "viewer", e: PointerEvent<HTMLElement>) {
    const pos = popupPos[key];
    popupDragRef.current = { key, x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function movePopup(e: PointerEvent<HTMLElement>) {
    const drag = popupDragRef.current;
    if (!drag.key) return;
    const key = drag.key as "chat" | "viewer";
    setPopupPos((p) => ({ ...p, [key]: { x: drag.ox + e.clientX - drag.x, y: drag.oy + e.clientY - drag.y } }));
  }

  function stopPopupDrag(e: PointerEvent<HTMLElement>) {
    popupDragRef.current.key = "";
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  function autoMinimizeChat() {
    if (window.innerWidth <= 800) setChatState('closed');
  }

  async function handle(text: string) {
    const lower = text.toLowerCase();
    const parts = text.split(/\s+/);
    const cmd = parts[0].replace("/", "");
    const rest = text.slice(parts[0].length).trim();

    setVideos([]);
    setNews([]);

    if (lower.includes("mode bulat") || lower.includes("mode orb") || lower.includes("jadi slime") || lower.includes("meleleh") || lower.includes("memantul") || lower.includes("berputar") || lower.includes("bergerak cepat") || lower.includes("ke kiri") || lower.includes("ke kanan") || lower.includes("ke tengah")) {
      if (lower.includes("slime")) setOrbMode("slime");
      else if (lower.includes("meleleh")) setOrbMode("melt");
      else if (lower.includes("memantul")) setOrbMode("bounce");
      else if (lower.includes("berputar")) setOrbMode("spin");
      else if (lower.includes("cepat")) setOrbMode("fast");
      else if (lower.includes("hewan")) setOrbMode("creature");
      else setOrbMode("idle");

      if (lower.includes("kiri")) setOrbSide("left");
      if (lower.includes("kanan")) setOrbSide("right");
      if (lower.includes("tengah")) setOrbSide("center");
      return "Baik, bentuk dan gerakan inti Anta saya ubah.";
    }

    if (lower.includes("izin folder") || lower.includes("akses folder")) return askFolderPermission();

    if ((lower.includes("cari file") || lower.includes("temukan file")) && files.length) {
      const query = text.replace(/.*?(cari file|temukan file)/i, "").trim().toLowerCase();
      const found = files.filter((f) => f.path.toLowerCase().includes(query)).slice(0, 20);
      setViewerLoading(false);
      setNews(found.map((f) => ({ title: f.path, link: "#", source: "Local Folder" })));
      setView({ title: `File: ${query}`, url: "", note: `${found.length} file ditemukan dari folder yang kamu izinkan.` });
      setViewerState("open");
      return found.length ? `Saya menemukan ${found.length} file. Sebut buka file pertama kalau ingin saya buka.` : `Saya tidak menemukan file dengan kata ${query}.`;
    }

    if (lower.includes("buka file pertama") && files.length) {
      const first = news[0]?.title;
      const file = files.find((f) => f.path === first);
      if (file) {
        await openLocalFile(file);
        return `Saya buka ${file.name} di tab baru.`;
      }
      return "Belum ada hasil file untuk dibuka.";
    }

    if (lower.includes("buka aplikasi") || lower.includes("jalankan aplikasi")) return openKnownApp(rest || text);

    const voice = voices.find((v) => lower.includes(v.id) || lower.includes(v.label.toLowerCase().split(" ")[0]));
    if ((lower.includes("ganti suara") || lower.includes("ubah suara")) && voice) {
      setSpeaker(voice.id);
      return `Baik, suara Anta saya ganti ke ${voice.label}.`;
    }

    if ((lower.includes("ganti suara") || lower.includes("ubah suara") || lower.includes("daftar suara") || lower.includes("suara siapa") || lower.includes("list suara")) && !voice) {
      const list = voices.map((v) => `• ${v.label}`).join("\n");
      return `Berikut daftar suara yang tersedia:\n${list}\n\nKetik "ganti suara [nama]" untuk mengganti.`;
    }

    if (lower.includes("minimize") || lower.includes("kecilkan")) {
      if (lower.includes("monitor") || lower.includes("browser") || lower.includes("website")) setViewerState("minimized");
      else setChatState("minimized");
      return "Baik, saya kecilkan panelnya.";
    }

    if (lower.includes("maximize") || lower.includes("besarkan") || (lower.includes("tampilkan") && !rest)) {
      if (lower.includes("monitor") || lower.includes("browser") || lower.includes("website") || lower.includes("berita") || lower.includes("lagu")) setViewerState("open");
      else setChatState("open");
      return "Baik, saya tampilkan panelnya.";
    }

    if (lower.includes("buang") || lower.includes("tutup") || lower.includes("close")) {
      // Check if user is referring to chat/panel itself
      if (lower.includes("chat") || lower.includes("panel") || lower.includes("jendela")) {
        setChatState("closed");
        return "Baik, saya tutup panelnya.";
      }
      // Check if user is referring to viewer/monitor/browser
      if (lower.includes("monitor") || lower.includes("browser") || lower.includes("website") || lower.includes("viewer")) {
        setViewerState("closed");
        return "Baik, saya tutup viewer.";
      }
      // Default: pass to AI, don't close anything
      return askAi(text);
    }

    if (cmd === "download" && rest) {
      const url = withProtocol(rest);
      window.open(url, "_blank");
      return `Baik, saya buka link download ${rest} di tab baru.`;
    }

    if (cmd === "edit" && rest) {
      return askAi(`Edit teks ini agar lebih natural dan rapi:\n${rest}`);
    }

    if (cmd === "balas" && rest) {
      return askAi(`Buat balasan singkat untuk pesan ini:\n${rest}`);
    }

    // buka website — natural: "buka youtube.com", "open google.com", "buk browser"
    // Also handle typos: "buk" = "buka", "brows" = "browser"
    const bukaMatch = lower.match(/(?:buk[a]?[k]?[an]?|open|tampilkan|bukakan|tolong\s*buka?)\s+(.+)/);
    if (bukaMatch) {
      const target = bukaMatch[1].trim();
      
      // "browser", "google", "internet" = open google.com
      const browserKeywords = ["browser", "brows", "internet", "google", "web"];
      if (browserKeywords.some(k => target.includes(k))) {
        const targetUrl = "https://www.google.com";
        if (!apiUrl) {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
          return `Saya membuka Google di tab baru.`;
        }
        const proxied = `${apiUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
        setViewerLoading(true);
        setView({ title: `Google`, url: proxied, note: "Google dimuat via Anta Secure Proxy." });
        setViewerState('open');
        autoMinimizeChat();
        return `Saya membuka Google di viewer Anta.`;
      }
      
      // Check if it looks like a URL/website (has dot or known domain)
      if (target.includes(".") || /^(https?:\/\/|www\.)/.test(target)) {
        const targetUrl = withProtocol(target);
        if (!apiUrl) {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
          return `Saya membuka ${target} di tab baru (proxy backend tidak tersedia).`;
        }
        const proxied = `${apiUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
        setViewerLoading(true);
        setView({ title: `Buka: ${target}`, url: proxied, note: "Website dimuat via Anta Secure Proxy." });
        setViewerState('open');
        autoMinimizeChat();
        return `Saya membuka website ${target} di viewer Anta.`;
      }
    }

    // berita — natural: "berita hari ini", "carikan berita", "cari berita teknologi"
    const beritaMatch = lower.match(/(?:carikan|cari|tampilkan|kasih|beri|tolong.*?(?:cari|carikan))?\s*berita\s*(.*)/i);
    if (beritaMatch || cmd === "berita") {
      const query = beritaMatch ? (beritaMatch[1] || "Indonesia hari ini").trim() : (rest || "Indonesia hari ini");
      try {
        const searchQuery = query || "Indonesia hari ini";
        const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const list = await res.json();
          setViewerLoading(false);
          setNews(list);
          setView({ title: `Berita: ${searchQuery}`, url: "", note: "Menampilkan berita terhangat." });
          setViewerState('open');
        autoMinimizeChat();
          return `Oke, saya buka jendela browser untuk menampilkan berita tentang "${searchQuery}".`;
        }
      } catch (err) {
        console.error("News fetch error", err);
      }
      setViewerLoading(false);
      return `Maaf, saya gagal mencari berita. Coba lagi nanti ya.`;
    }

    // lagu/musik — natural: "lagu dewa 19", "carikan lagu jazz", "putar musik pop"
    const laguMatch = lower.match(/(?:carikan|cari|putar|putarkan|tolong.*?(?:cari|putar))?\s*(?:lagu|musik|video|song)\s*(.*)/i);
    if (laguMatch) {
      const query = (laguMatch[1] || "").trim() || "Indonesia populer";
      try {
        const res = await fetch(`${apiUrl}/videos?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const list = await res.json();
          setViewerLoading(false);
          setVideos(list);
          setView({ title: `Lagu/Video: ${query}`, url: "", note: "Pilih video untuk diputar langsung di panel." });
          setViewerState('open');
        autoMinimizeChat();
          return `Oke, saya carikan lagu/video tentang "${query}".`;
        }
      } catch (err) {
        console.error("Video fetch error", err);
      }
      setViewerLoading(false);
      return `Maaf, saya gagal mencari video tentang ${query}.`;
    }

    // cari/web/gambar — natural: "cari resep nasi goreng", "gambar kucing lucu"
    const cariMatch = lower.match(/(?:carikan|cari|search|tolong.*?cari)\s+(.+)/i);
    const gambarMatch = lower.match(/(?:gambar|image|foto)\s+(.+)/i);
    if (gambarMatch || cariMatch) {
      const isImage = !!gambarMatch;
      const query = (isImage ? gambarMatch![1] : cariMatch![1]).trim();
      const kind = isImage ? "gambar" : "web";
      const targetUrl = searchUrl(kind, query, apiUrl);
      setViewerLoading(true);
      setView({ title: `${kind.toUpperCase()}: ${query}`, url: targetUrl, note: "Pencarian dimuat via Anta Secure Proxy." });
      setViewerState('open');
        autoMinimizeChat();
      return `Saya carikan ${kind} tentang "${query}" di viewer Anta.`;
    }

    // bacakan/baca — user asks Anta to read something aloud
    const bacaMatch = lower.match(/(?:bacakan|baca|tolong\s*baca(?:kan)?|coba\s*baca(?:kan)?)\s+(.+)/);
    if (bacaMatch) {
      const topic = bacaMatch[1].trim();
      // Return special marker that send() will handle
      return `__SPEAK__:${topic}`;
    }

    // normal chat
    return askAi(text);
  }

  function startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSubtitle("Browser ini belum mendukung voice input.");
      return;
    }
    const rec = new Recognition();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => {
      setListening(true);
      setSubtitle("Mendengarkan...");
    };
    rec.onend = () => setListening(false);
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript || "";
      if (text) void sendVoice(text);
    };
    rec.start();
  }

  async function sendVoice(text: string) {
    if (!text || loading) return;
    setLoading(true);
    setSubtitle(text);
    await saveMessage("user", text);

    try {
      const rawAnswer = await handle(text);
      const answer = cleanText(rawAnswer);
      setSubtitle(answer);
      await saveMessage("ai", answer);
      await saveMemory("conversation", `User: ${text}\nAnta: ${answer}`);
      await speakLine(answer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error tidak diketahui";
      setSubtitle(msg);
    } finally {
      setLoading(false);
    }
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setChatState('open');
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "Anta sedang mengetik . . ." }]);
    await saveMessage("user", text);

    try {
      const rawAnswer = await handle(text);
      const answer = cleanText(rawAnswer);
      
      // Check if this is a speak command
      if (answer.startsWith("__SPEAK__:")) {
        const topic = answer.replace("__SPEAK__:", "");
        setMessages((m) => [...m, { role: "ai", text: `Oke, saya bacakan ${topic}...` }]);
        
        // Show typing indicator
        setMessages((m) => [...m.slice(0, -1), { role: "ai", text: `Oke, saya bacakan ${topic}...` }, { role: "ai", text: "Anta sedang mengetik . . ." }]);
        setLoading(false);
        
        // Auto minimize chat on mobile
        autoMinimizeChat();
        
        // Generate content — use specific prompt that forces AI to output the full text
        let cleanContent = "";
        
        // Strategy 1: Ask AI directly (it should know common texts like Pancasila, Sumpah Pemuda, etc)
        const aiContent = await askAi(`Tuliskan isi lengkap dari "${topic}" secara verbatim/persis. Jangan tambahkan penjelasan, komentar, atau kata pembuka. Langsung tulis isinya saja dari awal sampai akhir. Jangan pakai markdown, nomor, atau simbol. Pisahkan dengan baris baru jika perlu. Contoh: jika diminta "Pancasila", langsung tulis "Ketuhanan Yang Maha Esa..." dst.`, false);
        cleanContent = cleanText(aiContent);
        
        // Strategy 2: If AI result is too short or looks wrong, try fetching from internet
        if (!cleanContent || cleanContent.length < 30) {
          try {
            if (apiUrl) {
              const searchRes = await fetch(`${apiUrl}/news?q=${encodeURIComponent(`isi lengkap ${topic}`)}`);
              const searchItems = searchRes.ok ? await searchRes.json() : [];
              if (searchItems.length > 0 && searchItems[0].link) {
                const articleRes = await fetch(`${apiUrl}/article?url=${encodeURIComponent(searchItems[0].link)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
                if (articleRes?.text && articleRes.text.length > 50) {
                  // Ask AI to extract the relevant part
                  const extracted = await askAi(`Dari teks berikut, ambil hanya bagian yang berisi "${topic}" secara lengkap. Jangan tambahkan komentar. Langsung tulis isinya saja:\n\n${articleRes.text.slice(0, 2000)}`, false);
                  cleanContent = cleanText(extracted);
                }
              }
            }
          } catch { /* ignore search errors */ }
        }
        
        // Final check
        if (!cleanContent || cleanContent.length < 30) {
          setMessages((m) => [...m.slice(0, -1), { role: "ai", text: `Maaf, saya tidak berhasil menemukan isi "${topic}". Coba ulangi dengan kata kunci yang lebih spesifik.` }]);
          setLoading(false);
          return;
        }
        
        // Replace typing indicator with actual content
        setMessages((m) => [...m.slice(0, -1), { role: "ai", text: cleanContent }]);
        
        // Speak it
        void speakLine(cleanContent);
        await saveMessage("ai", cleanContent);
        await saveMemory("conversation", `User: ${text}\nAnta: ${cleanContent}`);
        return;
      }
      
      // Replace typing indicator with actual answer
      setMessages((m) => [...m.slice(0, -1), { role: "ai", text: answer }]);
      await saveMessage("ai", answer);
      await saveMemory("conversation", `User: ${text}\nAnta: ${answer}`);
      setLoading(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error tidak diketahui";
      setMessages((m) => [...m.slice(0, -1), { role: "ai", text: msg }]);
      setLoading(false);
    }
  }

  function acceptAgent() {
    localStorage.setItem("anta_agent_accepted", "true");
    setAgentAccepted(true);
    setShowAgentBanner(false);
  }

  return (
    <main className="jarvis-desktop">
      {/* Agent Activation Banner */}
      {showAgentBanner && (
        <div className="agent-banner">
          <span>Anta dapat memantau aktivitas aplikasi di PC/Laptop kamu secara realtime melalui Local Agent. Jalankan <code>python local-agent/agent.py</code> lalu izinkan di sini.</span>
          <button onClick={acceptAgent}>Aktifkan Pemantauan</button>
        </div>
      )}

      {/* Background Equalizer Visualizer */}
      <div className={`center-container ${orbSide} ${viewerState === 'open' && viewerFullscreen ? 'orb-mini' : ''} ${chatState === 'open' ? 'orb-chat-open' : ''}`} style={{ "--orb-x": `${orbOffset.x}px`, "--orb-y": `${orbOffset.y}px` } as CSSProperties}>
        <div
          ref={orbRef}
          className={`orb-equalizer ${orbMode} ${orbDragging ? 'dragging' : ''} ${orbShake ? 'shake' : ''} ${isAiSpeaking ? 'active' : ''}`}
          onPointerDown={startOrbDrag}
          onPointerMove={moveOrb}
          onPointerUp={stopOrbDrag}
        >
          <div className="ring ring-1"></div>
          <div className="ring ring-2"></div>
          <div className="ring ring-3"></div>
          <div className="ring ring-4"></div>
          <div className="core"></div>
        </div>
        {subtitle && <div className="subtitle-bubble">{subtitle}</div>}
      </div>

      {/* Floating System Dock (Icons only) */}
      <nav className="dock">
        <button className={chatState === 'open' ? 'active' : ''} onClick={() => setChatState(chatState === 'open' ? 'closed' : 'open')} title="AI Chat">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button className={listening ? 'active' : ''} onClick={startVoiceInput} title="Perintah Suara">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
        </button>
      </nav>

      {/* Popup 1: AI Chat */}
      {chatState === 'open' && (
        <section className="popup-window chat-window" style={{ left: popupPos.chat.x, top: popupPos.chat.y }}>
          <header className="window-header" onPointerDown={(e) => { if (window.innerWidth > 800 && !(e.target instanceof Element && e.target.closest('.controls'))) startPopupDrag("chat", e); }} onPointerMove={movePopup} onPointerUp={stopPopupDrag}>
            <span className="title">💬 Anta Chat</span>
            <div className="controls">
              <button onClick={(e) => { e.stopPropagation(); setChatState('closed'); }} type="button">×</button>
            </div>
          </header>
          
          <div className="chat">
            {messages.map((msg, i) => <div key={i} className={`msg ${msg.role} ${msg.text === "Anta sedang mengetik . . ." ? "typing" : ""}`}>{msg.text}</div>)}
          </div>

          <form className="form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ketik pesan, berita, lagu, cari..." />
            <button disabled={loading || !input.trim()}>{loading ? "..." : "Kirim"}</button>
          </form>

        </section>
      )}

      {/* Popup 2: Website & Media Viewer */}
      {viewerState === 'open' && (
        <section className={`popup-window viewer-window ${viewerFullscreen ? 'viewer-fullscreen' : ''}`} style={viewerFullscreen ? undefined : { left: popupPos.viewer.x || undefined, right: popupPos.viewer.x ? undefined : 40, top: popupPos.viewer.y }}>
          <header className="window-header" onPointerDown={(e) => { if (window.innerWidth > 800 && !viewerFullscreen && !(e.target instanceof Element && e.target.closest('.controls'))) startPopupDrag("viewer", e); }} onPointerMove={movePopup} onPointerUp={stopPopupDrag}>
            <span className="title">🌐 Anta Monitor: {view.title || "No Signal"}</span>
            <div className="controls">
              <button onClick={(e) => { e.stopPropagation(); setViewerFullscreen(!viewerFullscreen); }} type="button" title="Fullscreen">⛶</button>
              <button onClick={(e) => { e.stopPropagation(); setViewerFullscreen(false); setViewerState('closed'); }} type="button">×</button>
            </div>
          </header>
          <div className="viewer-content">
            {viewerLoading && <div className="anta-loading"><span></span><b>Anta memuat data...</b></div>}
            {view.note && <p className="viewer-note">{view.note}</p>}
            
            {view.url && <iframe src={view.url} className="viewer-frame" title={view.title} onLoad={() => setViewerLoading(false)} />}
            
            {news.length > 0 && (
              <div className="news-list">
                {news.map((item, i) => {
                  const localFile = files.find((f) => f.path === item.title);
                  return (
                    <a key={i} href={localFile ? "#" : item.link} target={localFile ? undefined : "_blank"} rel="noreferrer" className="news-item" onClick={(e) => { if (localFile) { e.preventDefault(); void openLocalFile(localFile); } }}>
                      <h4>{item.title}</h4>
                      <span>{item.source} {item.pubDate ? `• ${item.pubDate}` : ""}</span>
                    </a>
                  );
                })}
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
