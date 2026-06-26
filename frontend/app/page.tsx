"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties, type PointerEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import AntaOrb3D from "./AntaOrb3D";

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

// News Bank — store summarized news for today, auto-clean yesterday's
// Works with Supabase if available, localStorage as fallback
async function cleanOldNews() {
  // Clean localStorage news bank if date changed
  try {
    const bank = JSON.parse(localStorage.getItem("anta_news_bank") || '{"date":"","items":[]}');
    if (bank.date !== new Date().toDateString()) {
      localStorage.setItem("anta_news_bank", JSON.stringify({ date: new Date().toDateString(), items: [] }));
    }
  } catch { localStorage.setItem("anta_news_bank", JSON.stringify({ date: new Date().toDateString(), items: [] })); }
  
  if (!supabase) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await supabase.from("news_bank").delete().lt("created_at", yesterday.toISOString()).then(() => {}, () => {});
}

async function saveNewsToBank(title: string, source: string, link: string, summary: string) {
  // Always save to localStorage
  try {
    const bank = JSON.parse(localStorage.getItem("anta_news_bank") || '{"date":"","items":[]}');
    if (bank.date !== new Date().toDateString()) bank.items = [];
    bank.date = new Date().toDateString();
    bank.items.push({ id: Date.now(), title, source, link, summary, spoken: false });
    localStorage.setItem("anta_news_bank", JSON.stringify(bank));
  } catch {}
  
  if (!supabase) return;
  await supabase.from("news_bank").insert({ title, source, link, summary, spoken: false }).then(() => {}, () => {});
}

async function getUnspokenNews(): Promise<{ id: number; summary: string; source: string } | null> {
  // Try Supabase first
  if (supabase) {
    try {
      const { data } = await supabase
        .from("news_bank")
        .select("id, summary, source")
        .eq("spoken", false)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) return data[0];
    } catch {}
  }
  
  // Fallback to localStorage
  try {
    const bank = JSON.parse(localStorage.getItem("anta_news_bank") || '{"date":"","items":[]}');
    if (bank.date !== new Date().toDateString()) return null;
    const item = bank.items.find((x: { spoken: boolean }) => !x.spoken);
    return item ? { id: item.id, summary: item.summary, source: item.source } : null;
  } catch {}
  return null;
}

async function markNewsSpoken(id: number) {
  // Mark in localStorage
  try {
    const bank = JSON.parse(localStorage.getItem("anta_news_bank") || '{"date":"","items":[]}');
    const item = bank.items.find((x: { id: number }) => x.id === id);
    if (item) item.spoken = true;
    localStorage.setItem("anta_news_bank", JSON.stringify(bank));
  } catch {}
  
  if (!supabase) return;
  await supabase.from("news_bank").update({ spoken: true }).eq("id", id).then(() => {}, () => {});
}

async function getNewsBankCount(): Promise<number> {
  // Try Supabase
  if (supabase) {
    try {
      const { count } = await supabase.from("news_bank").select("*", { count: "exact", head: true }).eq("spoken", false);
      if (count !== null) return count;
    } catch {}
  }
  
  // Fallback localStorage
  try {
    const bank = JSON.parse(localStorage.getItem("anta_news_bank") || '{"date":"","items":[]}');
    if (bank.date !== new Date().toDateString()) return 0;
    return bank.items.filter((x: { spoken: boolean }) => !x.spoken).length;
  } catch {}
  return 0;
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}


function isOrderedText(text: string) {
  return /(^|\n)\s*(\d+[.)]|[-•])\s+/.test(text);
}

function numberFromText(text: string) {
  const lower = text.toLowerCase();
  const words: Record<string, number> = { pertama: 0, satu: 0, kedua: 1, dua: 1, ketiga: 2, tiga: 2, keempat: 3, empat: 3, kelima: 4, lima: 4 };
  const digit = lower.match(/(?:nomor|no\.?|ke)?\s*(\d+)/);
  if (digit) return Number(digit[1]) - 1;
  const key = Object.keys(words).find((w) => lower.includes(w));
  return key ? words[key] : -1;
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

// OpenRouter API — primary AI provider (faster, more reliable)
const OPENROUTER_KEYS = [
  process.env.NEXT_PUBLIC_OPENROUTER_KEY || "",
  process.env.NEXT_PUBLIC_OPENROUTER_KEY2 || "",
  process.env.NEXT_PUBLIC_OPENROUTER_KEY3 || "",
].filter(k => k.length > 0);
const OPENAGENTIC_KEY = process.env.NEXT_PUBLIC_OPENAGENTIC_KEY || "";
let _keyIndex = 0;

function getNextOpenRouterKey(): string {
  if (OPENROUTER_KEYS.length === 0) return "";
  const key = OPENROUTER_KEYS[_keyIndex % OPENROUTER_KEYS.length];
  _keyIndex++;
  return key;
}

async function askOpenRouter(prompt: string, model = "qwen/qwen3-0.6b-04-28:free"): Promise<string> {
  const key = getNextOpenRouterKey();
  if (!key) throw new Error("No OpenRouter key");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://antasiar.web.id",
      "X-Title": "Anta AI"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter empty response");
  return content;
}

async function askOpenAgentic(prompt: string, model = "gpt-4o-mini"): Promise<string> {
  if (!OPENAGENTIC_KEY) throw new Error("No OpenAgentic key");
  const res = await fetch("https://openagentic.id/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAGENTIC_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`OpenAgentic error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAgentic empty response");
  return content;
}

const MISTRAL_KEY = process.env.NEXT_PUBLIC_MISTRAL_KEY || "";

const ZYLOO_KEY = process.env.NEXT_PUBLIC_ZYLOO_KEY || "";
const ZENMUX_KEY = process.env.NEXT_PUBLIC_ZENMUX_KEY || "";

async function askZenmux(prompt: string, model = "claude-sonnet-4-20250514"): Promise<string> {
  if (!ZENMUX_KEY) throw new Error("No ZenMux key");
  const res = await fetch("https://zenmux.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ZENMUX_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`ZenMux error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("ZenMux empty response");
  return content;
}

async function askZyloo(prompt: string, model = "zyloo/gpt-5.4"): Promise<string> {
  if (!ZYLOO_KEY) throw new Error("No Zyloo key");
  const res = await fetch("https://zyloo.io/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ZYLOO_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Zyloo error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Zyloo empty response");
  return content;
}

async function askMistral(prompt: string, model = "mistral-small-latest"): Promise<string> {
  if (!MISTRAL_KEY) throw new Error("No Mistral key");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Mistral error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral empty response");
  return content;
}

async function askMimo(prompt: string): Promise<string> {
  if (!apiUrl) throw new Error("No API URL for MiMo");
  const res = await fetch(`${apiUrl}/mimo/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) throw new Error(`MiMo error ${res.status}`);
  const data = await res.json();
  if (!data?.content) throw new Error("MiMo empty response");
  return data.content;
}

async function askBackendChat(prompt: string): Promise<string> {
  if (!apiUrl) throw new Error("No API URL");
  const res = await fetch(`${apiUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`Backend chat error ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("Backend chat empty response");
  return text;
}

async function askAi(text: string, cache = true) {
  const key = `anta:${text}`;
  const cached = cache ? localStorage.getItem(key) : null;
  if (cached) return cached;

  // Browser should not call AI vendors directly: CORS/403 noise. Backend handles providers.
  const strategies = [
    () => askBackendChat(text),
    () => askPollinations(`Kamu Anta, asisten AI yang natural dan ramah. Jawab dengan gaya bicara santai seperti teman ngobrol biasa. Jangan gunakan markdown, jangan sebut dirimu sebagai AI/bot. Jawab langsung sesuai konteks.\n\nUser: ${text}`, "openai"),
  ];
  
  for (let i = 0; i < strategies.length; i++) {
    try {
      const answer = await strategies[i]();
      if (answer && answer.length >= 2) {
        if (cache) localStorage.setItem(key, answer.slice(0, 4000));
        return answer;
      }
    } catch { /* try next */ }
    
    // Wait before retry
    if (i < strategies.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  throw new Error("Anta belum bisa merespons. Coba lagi sebentar.");
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
  const [articleText, setArticleText] = useState("");
  
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
  const [audioLevel, setAudioLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [orbMode, setOrbMode] = useState("idle");
  const [orbSide, setOrbSide] = useState("center");
  const [orbOffset, setOrbOffset] = useState({ x: 0, y: 0 });
  const [orbShake, setOrbShake] = useState(false);
  const [orbDragging, setOrbDragging] = useState(false);
  const [orbMoveEnabled, setOrbMoveEnabled] = useState(true);
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
  const seenNewsRef = useRef(new Set<string>((() => {
    try {
      const stored = localStorage.getItem("anta_seen_news");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean if stored date is not today
        if (parsed.date !== new Date().toDateString()) return [];
        return parsed.links || [];
      }
    } catch {}
    return [];
  })()));
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
    if (!text) return "";
    return String(text)
      .replace(/\\+n/g, "\n") // replace \n, \\n, \\\n etc with real newline
      .replace(/\b(undefined|null|NaN)\b/gi, "")
      .replace(/\\+/g, "") // strip remaining backslashes
      .replace(/[\*\#\"`]/g, "") // strip markdown * # ` "
      .replace(/\/(?=[a-zA-Z])/g, "") // strip forward slash before letters (command-like)
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  async function speakLine(text: string) {
    const clean = cleanText(text);
    if (!clean) return;

    // instant visual trigger
    setIsAiSpeaking(true);
    
    // Wait 2 seconds before starting subtitle display
    await new Promise(r => setTimeout(r, 2000));
    
    // Auxiliary function to run when audio starts playing
    const playTypingEffect = () => {
      setSubtitle(""); 
      let i = 0;
      // Capitalize first letter and ensure period at end
      const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
      const withPeriod = formatted.endsWith(".") || formatted.endsWith("!") || formatted.endsWith("?") ? formatted : formatted + ".";
      const words = withPeriod.split(" ");
      
      const intervalTyping = setInterval(() => {
        if (i >= words.length) {
          clearInterval(intervalTyping);
          return;
        }
        const word = words[i++];
        if (!word) return;
        setSubtitle((prev) => (prev ? prev + " " + word : word));
      }, 220);

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

  // Startup greeting — orb says hello after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      void speakLine("Anta online. Siap membantu.");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

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
      setAudioLevel(energy);

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
      setAudioLevel(0);
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

  // Orb stays idle — gentle breathing animation only, no random mode switching

  // Timer 1: News Fetcher — every ~5 min, fetch new news if bank is low
  useEffect(() => {
    if (!apiUrl) return;
    const fetchNews = async () => {
      try {
        await cleanOldNews();
        const bankCount = await getNewsBankCount();
        // Only fetch if bank has 5 or fewer unspoken items
        if (bankCount > 5) return;
        
        const topics = ["Indonesia terbaru", "teknologi terbaru", "Yogyakarta hari ini", "ekonomi Indonesia", "olahraga Indonesia", "hiburan Indonesia", "pendidikan Indonesia", "kesehatan", "startup Indonesia", "cuaca Indonesia"];
        // Try up to 2 different topics to find fresh news
        for (let topicAttempt = 0; topicAttempt < 2; topicAttempt++) {
          const topic = topics[Math.floor(Math.random() * topics.length)];
          const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(`${topic} berita terbaru`)}`);
          const items = res.ok ? await res.json() : [];
          
          // Process 3-4 random items per fetch
          const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 4);
          let addedAny = false;
          
          for (const item of shuffled) {
            if (!item.link || seenNewsRef.current.has(item.link)) continue;
            if (item.pubDate) {
              const pubTime = new Date(item.pubDate).getTime();
              if (isNaN(pubTime) || Date.now() - pubTime > 24 * 60 * 60 * 1000) continue;
            }
            seenNewsRef.current.add(item.link);
            try { localStorage.setItem("anta_seen_news", JSON.stringify({ date: new Date().toDateString(), links: [...seenNewsRef.current].slice(-100) })); } catch {}
          
            const article = await fetch(`${apiUrl}/article?url=${encodeURIComponent(item.link)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
            const content = (article?.text && !article?.error && article.text.length > 80) ? article.text : "";
            if (!content && (!item.title || item.title.length < 15)) continue;
          
            const source = item.source || (() => { try { return new URL(item.link).hostname.replace("www.", ""); } catch { return "media Indonesia"; } })();
          
            const prompt = content
              ? `Kamu Anta, AI asisten. Rangkum berita berikut menjadi 2-3 kalimat ringkas dengan gaya natural seperti teman ngobrol. JANGAN tampilkan judul asli. Parafrase seluruhnya dengan kata-katamu sendiri. Di akhir tambahkan: "(Sumber: ${source})". Jangan pakai markdown.\n\nIsi berita: ${content.slice(0, 1200)}`
              : `Kamu Anta, AI asisten. Sampaikan berita dengan judul "${item.title}" dalam 2 kalimat dengan gaya santai seperti teman yang ngasih tau berita. Jangan tampilkan judul asli, parafrase dengan kata-katamu. Di akhir tambahkan: "(Sumber: ${source})". Jangan pakai markdown.`;
          
            const summary = await askAi(prompt, false);
            const summaryLower = summary.toLowerCase();
            if (summaryLower.includes("javascript") || summaryLower.includes("undefined") || summaryLower.includes("error") || summary.length < 20) continue;
          
            await saveNewsToBank(item.title || "", source, item.link, summary);
            addedAny = true;
            
            // Delay between items to avoid rate limiting
            await new Promise(r => setTimeout(r, 5000));
          }
          
          if (addedAny) break; // Got some news, stop trying more topics
        }
      } catch { /* silent */ }
    };
    
    // First fetch after 10s, then every 5 min (± 1 min random)
    const firstTimer = window.setTimeout(fetchNews, 10000);
    const interval = window.setInterval(fetchNews, 300000 + Math.floor(Math.random() * 60000));
    return () => { window.clearTimeout(firstTimer); window.clearInterval(interval); };
  }, [apiUrl]);

  // Timer 2: News Speaker — every ~25-45 sec, speak one unspoken news from bank
  useEffect(() => {
    if (loading || isAiSpeaking || listening) return;
    const timer = window.setTimeout(async () => {
      try {
        const unspoken = await getUnspokenNews();
        if (unspoken && unspoken.summary.length > 20) {
          // Double-check: haven't we spoken this ID already? (localStorage backup)
          const spokenIds: number[] = JSON.parse(localStorage.getItem("anta_spoken_ids") || "[]");
          if (spokenIds.includes(unspoken.id)) return;
          
          await markNewsSpoken(unspoken.id);
          spokenIds.push(unspoken.id);
          // Keep only last 50 IDs
          localStorage.setItem("anta_spoken_ids", JSON.stringify(spokenIds.slice(-50)));
          
          void speakLine(unspoken.summary);
          void speakLine(unspoken.summary);
        }
      } catch { /* silent */ }
    }, 25000 + Math.floor(Math.random() * 20000));
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
    if (!orbMoveEnabled) return;
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

    const openIndex = /buka.*(nomor|no\.?|pertama|kedua|ketiga|keempat|kelima|satu|dua|tiga|empat|lima)/i.test(lower) ? numberFromText(text) : -1;
    if (openIndex >= 0 && news[openIndex]) {
      const item = news[openIndex];
      const localFile = files.find((f) => f.path === item.title);
      if (localFile) {
        await openLocalFile(localFile);
        return `Saya buka ${localFile.name} di tab baru.`;
      }
      setViewerLoading(true);
      setViewerState('open');
      try {
        const article = apiUrl ? await fetch(`${apiUrl}/article?url=${encodeURIComponent(item.link)}`).then((r) => r.ok ? r.json() : null) : null;
        setArticleText(article?.text || "");
        setView({ title: item.title, url: "", note: article?.text ? `Artikel dari ${item.source}` : "Artikel tidak bisa diambil. Klik judul untuk buka sumber asli." });
      } finally {
        setViewerLoading(false);
      }
      return `Saya buka nomor ${openIndex + 1}.`;
    }
    if (openIndex >= 0 && videos[openIndex]) {
      const item = videos[openIndex];
      setViewerLoading(false);
      setArticleText("");
      setView({ title: item.title, url: item.url, note: "Memutar video." });
      setViewerState('open');
      return `Saya buka video nomor ${openIndex + 1}.`;
    }

    setVideos([]);
    setNews([]);
    setArticleText("");

    if (/(bisa|boleh|aktifkan|izinkan).*geser|geser.*(orb|anta|inti)/i.test(lower)) {
      setOrbMoveEnabled(true);
      return "Baik, orb Anta sekarang bisa digeser.";
    }

    if (/(jangan|tidak|nggak|nonaktifkan|kunci).*geser|kunci.*(orb|anta|inti)/i.test(lower)) {
      setOrbMoveEnabled(false);
      setOrbDragging(false);
      return "Baik, orb Anta saya kunci lagi.";
    }

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
      
      // Browser lives inside Anta. Google itself blocks iframe/proxy, so show Anta search shell.
      const browserKeywords = ["browser", "brows", "internet", "google", "web"];
      if (browserKeywords.some(k => target.includes(k))) {
        setViewerLoading(false);
        setArticleText("");
        setNews([]);
        setVideos([]);
        setView({ title: "Browser", url: "", note: "Browser Anta siap. Ketik: cari [kata kunci], berita [topik], atau buka [website]." });
        setViewerState('open');
        autoMinimizeChat();
        return `Saya buka browser di dalam Anta.`;
      }
      
      // Check if it looks like a URL/website (has dot or known domain)
      if (target.includes(".") || /^(https?:\/\/|www\.)/.test(target)) {
        const targetUrl = withProtocol(target);
        if (/^https?:\/\/(www\.)?google\./i.test(targetUrl)) {
          setViewerLoading(false);
          setArticleText("");
          setNews([]);
          setVideos([]);
          setView({ title: "Google", url: "", note: "Google tidak bisa ditanam langsung. Pakai pencarian Anta: ketik cari [kata kunci]." });
          setViewerState('open');
          autoMinimizeChat();
          return `Saya buka pencarian Anta di viewer.`;
        }
        if (!apiUrl) {
          setViewerLoading(false);
          setArticleText("");
          setNews([]);
          setVideos([]);
          setView({ title: `Buka: ${target}`, url: "", note: "Backend proxy belum tersedia, jadi website tidak bisa dimuat di dalam Anta." });
          setViewerState('open');
          autoMinimizeChat();
          return `Saya tampilkan di viewer Anta, tapi proxy backend belum tersedia.`;
        }
        const proxied = `${apiUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
        setViewerLoading(true);
        setArticleText("");
        setNews([]);
        setVideos([]);
        setView({ title: `Buka: ${target}`, url: proxied, note: "Website dimuat di dalam Anta. Jika situs memblokir embed, pakai cari [topik] agar Anta tampilkan hasil/teksnya." });
        setViewerState('open');
        autoMinimizeChat();
        return `Saya membuka website ${target} di dalam Anta.`;
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
          setView({ title: `Berita: ${searchQuery}`, url: "", note: list.length ? "Menampilkan berita terhangat. Bilang: buka nomor satu." : "Tidak ada berita ditemukan." });
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
      try {
        const res = apiUrl ? await fetch(`${apiUrl}/search?q=${encodeURIComponent(isImage ? `gambar ${query}` : query)}`) : null;
        const list = res?.ok ? await res.json() : [];
        setViewerLoading(false);
        setNews(list);
        setView({ title: `${kind.toUpperCase()}: ${query}`, url: "", note: list.length ? "Hasil pencarian. Bilang: buka nomor satu." : "Tidak ada hasil." });
        setViewerState('open');
        autoMinimizeChat();
        return list.length ? `Saya menemukan hasil ${kind} tentang "${query}".` : `Saya belum menemukan hasil untuk "${query}".`;
      } catch {
        setViewerLoading(false);
        return `Maaf, pencarian gagal. Coba lagi nanti ya.`;
      }
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
    setMessages((m) => [...m, { role: "user", text }]);
    await saveMessage("user", text);

    try {
      const rawAnswer = await handle(text);
      if (rawAnswer.startsWith("__SPEAK__:")) {
        // Bacakan topic — get AI answer for the topic
        const topic = rawAnswer.slice(10);
        const answer = cleanText(await askAi(topic));
        setMessages((m) => [...m, { role: "ai", text: answer }]);
        setSubtitle(answer);
        await saveMessage("ai", answer);
        await saveMemory("conversation", `User: ${text}\nAnta: ${answer}`);
        await speakLine(answer);
      } else {
        const answer = cleanText(rawAnswer);
        setMessages((m) => [...m, { role: "ai", text: answer }]);
        setSubtitle(answer);
        await saveMessage("ai", answer);
        await saveMemory("conversation", `User: ${text}\nAnta: ${answer}`);
        await speakLine(answer);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error tidak diketahui";
      setMessages((m) => [...m, { role: "ai", text: msg }]);
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
        
        // Replace typing indicator with "searching" message — keep chat open
        setMessages((m) => [...m.slice(0, -1), { role: "ai", text: `Oke, saya akan membacakan ${topic}. Tunggu sebentar...` }, { role: "ai", text: "Anta sedang mengetik . . ." }]);
        
        // Generate content with numbered format and intro/outro
        let cleanContent = "";
        
        // Strategy 1: Ask AI directly
        const aiContent = await askAi(`Tuliskan isi lengkap dari "${topic}". Aturan:
- Jika isinya berurutan (seperti Pancasila, Sumpah Pemuda, Asmaul Husna dll), tulis dengan format bernomor: "1. ...", "2. ...", dst.
- Jika isinya paragraf/prosa (seperti doa, puisi, pidato), tulis langsung tanpa nomor.
- JANGAN tambahkan penjelasan, komentar, atau kata pembuka/penutup.
- JANGAN pakai markdown atau simbol khusus.
- Langsung tulis isinya saja dari awal sampai akhir.`, false);
        cleanContent = cleanText(aiContent);
        
        // Strategy 2: If AI result is too short, try fetching from internet
        if (!cleanContent || cleanContent.length < 30) {
          try {
            if (apiUrl) {
              const searchRes = await fetch(`${apiUrl}/news?q=${encodeURIComponent(`isi lengkap ${topic}`)}`);
              const searchItems = searchRes.ok ? await searchRes.json() : [];
              if (searchItems.length > 0 && searchItems[0].link) {
                const articleRes = await fetch(`${apiUrl}/article?url=${encodeURIComponent(searchItems[0].link)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
                if (articleRes?.text && articleRes.text.length > 50) {
                  const extracted = await askAi(`Dari teks berikut, ambil hanya bagian yang berisi "${topic}" secara lengkap. Jika berurutan, tulis dengan nomor. Jangan tambahkan komentar. Langsung tulis isinya saja:\n\n${articleRes.text.slice(0, 2000)}`, false);
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
        
        // Build full speech with intro and outro
        const intro = `Baik, saya akan membacakan ${topic}.`;
        const outro = `Sudah saya bacakan terkait ${topic}. Apakah ada lagi yang bisa saya bantu?`;
        const fullSpeech = `${intro}\n\n${cleanContent}\n\n${outro}`;
        
        // Data ready — show content in chat with notice
        setMessages((m) => [...m.slice(0, -1), { role: "ai", text: fullSpeech }, { role: "ai", text: "Saya akan mulai membacakannya..." }]);
        setLoading(false);
        
        // Wait 3 seconds so user can see the content, then close while reading.
        await new Promise(r => setTimeout(r, 3000));
        
        setMessages((m) => m.filter(msg => msg.text !== "Saya akan mulai membacakannya..."));
        setChatState('closed');
        
        void speakLine(fullSpeech);
        
        const reopenChat = () => setChatState('open');
        const attachReopen = (tries = 40) => {
          const audio = audioRef.current;
          if (audio) {
            audio.addEventListener("ended", reopenChat, { once: true });
            audio.addEventListener("pause", reopenChat, { once: true });
            return;
          }
          if (tries > 0) window.setTimeout(() => attachReopen(tries - 1), 250);
          else window.setTimeout(reopenChat, Math.max(3000, fullSpeech.split(" ").length * 250));
        };
        attachReopen();
        
        await saveMessage("ai", fullSpeech);
        await saveMemory("conversation", `User: ${text}\nAnta: ${fullSpeech}`);
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
          className={`orb-equalizer ${orbMode} ${orbMoveEnabled ? 'movable' : 'locked'} ${orbDragging ? 'dragging' : ''} ${orbShake ? 'shake' : ''} ${isAiSpeaking ? 'active' : ''}`}
          onPointerDown={startOrbDrag}
          onPointerMove={moveOrb}
          onPointerUp={stopOrbDrag}
        >
          <div className="ring ring-4" />
          <div className="ring ring-3" />
          <div className="ring ring-2" />
          <div className="ring ring-1" />
          <AntaOrb3D active={isAiSpeaking} level={audioLevel} />
        </div>
        {subtitle && <div className={`subtitle-bubble ${isOrderedText(subtitle) ? 'align-left' : ''}`}>{subtitle}</div>}

        {/* Orbit Menu — inside center-container so it follows orb animations */}
        <nav className={`dock ${chatState === 'closed' && viewerState === 'closed' ? 'orbit-menu' : 'popup-dock'}`}>
          <button className={chatState === 'open' ? 'active' : ''} onClick={() => setChatState(chatState === 'open' ? 'closed' : 'open')} title="AI Chat">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button className={listening ? 'active' : ''} onClick={startVoiceInput} title="Perintah Suara">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
        </nav>
      </div>

      {/* Popup 1: AI Chat */}
      {chatState === 'open' && (
        <section className="popup-window chat-window" style={{ left: popupPos.chat.x, top: popupPos.chat.y }}>
          <header className="window-header" onPointerDown={(e) => { if (window.innerWidth > 800 && !(e.target instanceof Element && e.target.closest('.controls'))) startPopupDrag("chat", e); }} onPointerMove={movePopup} onPointerUp={stopPopupDrag}>
            <span className="title">Anta Chat</span>
            <div className="controls">
              <button onClick={(e) => { e.stopPropagation(); setChatState('closed'); }} type="button">×</button>
            </div>
          </header>
          
          <div className="chat">
            {messages.map((msg, i) => <div key={i} className={`msg ${msg.role} ${msg.text === "Anta sedang mengetik . . ." ? "typing" : ""} ${isOrderedText(msg.text) ? "ordered" : ""}`}>{msg.text}</div>)}
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
            <span className="title">Anta Monitor: {view.title || "No Signal"}</span>
            <div className="controls">
              <button onClick={(e) => { e.stopPropagation(); setViewerFullscreen(!viewerFullscreen); }} type="button" title="Fullscreen">⛶</button>
              <button onClick={(e) => { e.stopPropagation(); setViewerFullscreen(false); setViewerState('closed'); }} type="button">×</button>
            </div>
          </header>
          <div className="viewer-content">
            {viewerLoading && <div className="anta-loading"><span></span><b>Anta memuat data...</b></div>}
            {view.note && <p className="viewer-note">{view.note}</p>}
            
            {view.url && <iframe src={view.url} className="viewer-frame" title={view.title} onLoad={() => setViewerLoading(false)} />}
            
            {!view.url && !articleText && news.length === 0 && videos.length === 0 && <div className="browser-empty">Ketik di chat: cari sesuatu, berita hari ini, atau buka example.com.</div>}

            {articleText && <article className="article-view">{articleText}</article>}

            {!articleText && news.length > 0 && (
              <div className="news-list">
                {news.map((item, i) => {
                  const localFile = files.find((f) => f.path === item.title);
                  return (
                    <a key={i} href="#" className="news-item" onClick={async (e) => {
                      e.preventDefault();
                      if (localFile) return void openLocalFile(localFile);
                      setViewerLoading(true);
                      try {
                        const article = apiUrl ? await fetch(`${apiUrl}/article?url=${encodeURIComponent(item.link)}`).then((r) => r.ok ? r.json() : null) : null;
                        setArticleText(article?.text || "");
                        setView({ title: item.title, url: "", note: article?.text ? `Artikel dari ${item.source}` : "Artikel tidak bisa diambil. Pakai sumber asli jika perlu." });
                      } finally {
                        setViewerLoading(false);
                      }
                    }}>
                      <h4>{i + 1}. {item.title}</h4>
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
