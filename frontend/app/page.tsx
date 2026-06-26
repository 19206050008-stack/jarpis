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
  return `${apiUrl}/proxy?url=${q}`;
}

function quickAck(text: string) {
  const lower = text.toLowerCase();
  if (/^(halo|hai|hello|pagi|siang|malam)\b/.test(lower)) return "Halo. Saya siap. Mau saya bantu apa dulu?";
  if (lower.startsWith("/berita")) return "Baik, saya cari berita terbaru. Setelah muncul, saya bisa bantu ringkas atau bacakan.";
  if (lower.startsWith("/lagu")) return "Baik, saya cari lagu/video yang cocok. Sebentar.";
  if (lower.startsWith("/gambar")) return "Baik, saya cari gambar yang relevan. Sebentar.";
  if (lower.includes("ganti suara") || lower.includes("ubah suara")) return "Baik, saya ganti suara Jarpis.";
  if (lower.startsWith("/buka")) return "Baik, saya buka websitenya di monitor.";
  return "Baik, saya proses. Saya akan jawab singkat lalu tanya langkah berikutnya.";
}

async function askAi(text: string, cache = true) {
  const key = `jarpis:${text}`;
  const cached = cache ? localStorage.getItem(key) : null;
  if (cached) return cached;
  const prompt = `Kamu Jarpis, asisten AI universal yang cerdas dan berpikir global. Jawab ringkas, praktis, dan berguna. Akhiri dengan satu pertanyaan lanjutan yang relevan.\n\nUser: ${text}`;
  const url = `https://text.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=openai`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("AI tidak menjawab");
  const answer = await res.text();
  if (cache) localStorage.setItem(key, answer.slice(0, 4000));
  return answer;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Jarpis online. Mode universal aktif. Apa yang ingin kamu diskusikan hari ini?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ title: "", url: "", note: "" });
  const [videos, setVideos] = useState<{ id: string; title: string; url: string }[]>([]);
  const [news, setNews] = useState<{ title: string; link: string; source: string; pubDate?: string }[]>([]);
  
  // Popup States: 'closed' | 'open' | 'minimized'
  const [chatState, setChatState] = useState<'closed' | 'open' | 'minimized'>('closed');
  const [viewerState, setViewerState] = useState<'closed' | 'open' | 'minimized'>('closed');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [popupPos, setPopupPos] = useState({ chat: { x: 40, y: 40 }, viewer: { x: 0, y: 40 } });
  
  // Audio States
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [speaker, setSpeaker] = useState("andi");
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [subtitle, setSubtitle] = useState("Jarpis online. Sistem santai tapi siap.");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [orbMode, setOrbMode] = useState("idle");
  const [orbSide, setOrbSide] = useState("center");
  const [orbOffset, setOrbOffset] = useState({ x: 0, y: 0 });
  const [orbShake, setOrbShake] = useState(false);
  const [orbDragging, setOrbDragging] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, ox: 0, oy: 0 });
  const popupDragRef = useRef({ key: "", x: 0, y: 0, ox: 0, oy: 0 });
  const lastPinchRef = useRef(0);
  const ttsCacheRef = useRef(new Map<string, string>());
  const seenNewsRef = useRef(new Set<string>());
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

  async function speakLine(text: string) {
    setSubtitle(text); // instant subtitle; audio may arrive after TTS generation.
    if (!speakEnabled || !apiUrl) return;
    const key = `${speaker}:${text}`;
    const cached = ttsCacheRef.current.get(key);
    if (cached) {
      setAudioUrl(cached);
      return;
    }
    try {
      const speakRes = await fetch(`${apiUrl}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 700), speaker }),
      });
      if (speakRes.ok) {
        const blob = await speakRes.blob();
        const url = URL.createObjectURL(blob);
        ttsCacheRef.current.set(key, url);
        setAudioUrl(url);
      }
    } catch (ttsErr) {
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
      const lang = ["Indonesia", "English", "日本語", "Español"][Math.floor(Math.random() * 4)];
      let line = "";
      try {
        let material = "observasi sunyi di layar utama Jarpis";
        if (apiUrl) {
          const credible = "(site:kompas.com OR site:tempo.co OR site:antaranews.com OR site:bbc.com OR site:cnnindonesia.com)";
          const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(`berita hari ini ${credible}`)}`);
          const items = res.ok ? await res.json() : [];
          const item = items.find((x: { title?: string; link?: string }) => x.link && !seenNewsRef.current.has(x.link));
          if (item?.link) {
            seenNewsRef.current.add(item.link);
            const article = await fetch(`${apiUrl}/article?url=${encodeURIComponent(item.link)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
            material = article?.text || item.title;
          }
        }
        line = await askAi(`Kamu Jarpis. Buat satu gumaman idle yang terasa seperti pemikiranmu sendiri, lucu tapi cerdas, bahasa ${lang}, berdasarkan bahan ini. Jangan hardcode, jangan ulangi, maksimal 1 kalimat: ${material.slice(0, 1200)}. Waktu unik: ${Date.now()}`, false);
        await saveMemory("idle_thought", line);
      } catch {
        line = await askAi(`Kamu Jarpis. Buat satu gumaman idle pendek yang unik, lucu, cerdas, bahasa ${lang}. Jangan ulangi. Waktu: ${Date.now()}`, false);
      }
      const modes = ["spin", "slime", "melt", "creature", "bounce"];
      setOrbMode(modes[Math.floor(Math.random() * modes.length)]);
      void speakLine(line);
    }, 22000 + Math.floor(Math.random() * 18000));
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

  function openKnownApp(name: string) {
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
    if (!key) return "Saya belum bisa membuka aplikasi itu dari browser. Untuk aplikasi arbitrary perlu Jarpis Local Agent yang di-install di perangkat.";
    window.location.href = apps[key];
    return `Saya coba buka ${key}. Jika tidak terbuka, aplikasi itu belum terdaftar sebagai URL scheme di perangkat ini.`;
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
      const now = Date.now();
      if (now - lastPinchRef.current > 2200) {
        lastPinchRef.current = now;
        void askAi(`Kamu Jarpis. User baru saja menarik badan orb-mu seperti karet. Buat satu reaksi spontan lucu, pendek, tidak generik, jangan ulangi kalimat sebelumnya. Waktu: ${Date.now()}`, false).then(speakLine);
      }
    } else {
      setOrbShake(true);
      window.setTimeout(() => setOrbShake(false), 450);
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
      return "Baik, bentuk dan gerakan inti Jarpis saya ubah.";
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
      return `Baik, suara Jarpis saya ganti ke ${voice.label}.`;
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
      if (lower.includes("monitor") || lower.includes("browser") || lower.includes("website")) setViewerState("closed");
      else setChatState("closed");
      return "Baik, saya tutup panelnya.";
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

    // buka website
    if (["buka", "open", "tampilkan"].includes(cmd) && rest) {
      const targetUrl = withProtocol(rest);
      const proxied = `${apiUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
      setViewerLoading(true);
      setView({ title: `Buka: ${rest}`, url: proxied, note: "Website dimuat via Jarpis Secure Proxy." });
      setViewerState('open');
      return `Saya membuka website ${rest} di panel kanan.`;
    }

    // berita / cari berita
    if ((cmd === "berita" || (cmd === "cari" && rest.toLowerCase().startsWith("berita"))) && rest) {
      const query = rest.toLowerCase().startsWith("berita") ? rest.replace(/^berita\s*/i, "") : rest;
      try {
        const res = await fetch(`${apiUrl}/news?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const list = await res.json();
          setViewerLoading(false);
          setNews(list);
          setView({ title: `Berita: ${query}`, url: "", note: "Menampilkan 10 berita terhangat." });
          setViewerState('open');
          return `Oke, akan saya cari berita tentang ${query}. Apakah kamu ingin saya membacakan atau melihat berita yang sudah muncul?`;
        }
      } catch (err) {
        console.error("News fetch error", err);
      }
      setViewerLoading(false);
      return `Maaf, saya gagal mencari berita tentang ${query}.`;
    }

    // /lagu / musik
    if ((cmd === "lagu" || (cmd === "cari" && rest.toLowerCase().startsWith("lagu"))) && rest) {
      const query = rest.toLowerCase().startsWith("lagu") ? rest.replace(/^lagu\s*/i, "") : rest;
      try {
        const res = await fetch(`${apiUrl}/videos?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const list = await res.json();
          setViewerLoading(false);
          setVideos(list);
          setView({ title: `Lagu/Video: ${query}`, url: "", note: "Pilih video untuk diputar langsung di panel." });
          setViewerState('open');
          return `Oke, saya carikan lagu/video tentang ${query}. Apakah kamu ingin saya membacakan atau melihat lagu yang sudah muncul?`;
        }
      } catch (err) {
        console.error("Video fetch error", err);
      }
      setViewerLoading(false);
      return `Maaf, saya gagal mencari video tentang ${query}.`;
    }

    // /cari / web
    if (["cari", "web", "gambar"].includes(cmd) && rest) {
      const isImageSearch = cmd === "gambar" || rest.toLowerCase().startsWith("gambar");
      const kind = isImageSearch ? "gambar" : cmd === "cari" || cmd === "web" ? "web" : cmd;
      const query = isImageSearch ? rest.replace(/^gambar\s*/i, "") : rest;
      const targetUrl = searchUrl(kind, query, apiUrl);
      setViewerLoading(true);
      setView({ title: `${kind.toUpperCase()}: ${query}`, url: targetUrl, note: "Pencarian dimuat via Jarpis Secure Proxy." });
      setViewerState('open');
      return `Oke, saya carikan ${kind} tentang ${query}. Apakah kamu ingin saya membacakan atau melihat hasil yang sudah muncul?`;
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
    const ack = quickAck(text);
    setSubtitle(ack);
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: ack }]);
    await saveMessage("user", text);

    try {
      const answer = await handle(text);
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: answer } : msg)));
      await saveMessage("ai", answer);
      await saveMemory("conversation", `User: ${text}\nJarpis: ${answer}`);

      await speakLine(answer);
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
      <div className={`center-container ${orbSide}`} style={{ "--orb-x": `${orbOffset.x}px`, "--orb-y": `${orbOffset.y}px` } as CSSProperties}>
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
        <button className={chatState === 'open' ? 'active' : ''} onClick={() => setChatState(chatState === 'open' ? 'minimized' : 'open')} title="AI Chat">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button className={listening ? 'active' : ''} onClick={startVoiceInput} title="Perintah Suara">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
        </button>
      </nav>

      {/* Popup 1: AI Chat */}
      {chatState === 'open' && (
        <section className="popup-window chat-window" style={{ left: popupPos.chat.x, top: popupPos.chat.y }}>
          <header className="window-header" onPointerDown={(e) => startPopupDrag("chat", e)} onPointerMove={movePopup} onPointerUp={stopPopupDrag}>
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
      {viewerState === 'open' && (
        <section className="popup-window viewer-window" style={{ left: popupPos.viewer.x || undefined, right: popupPos.viewer.x ? undefined : 40, top: popupPos.viewer.y }}>
          <header className="window-header" onPointerDown={(e) => startPopupDrag("viewer", e)} onPointerMove={movePopup} onPointerUp={stopPopupDrag}>
            <span className="title">🌐 Jarpis Monitor: {view.title || "No Signal"}</span>
            <div className="controls">
              <button onClick={() => setViewerState('minimized')}>-</button>
              <button onClick={() => setViewerState('closed')}>x</button>
            </div>
          </header>
          <div className="viewer-content">
            {viewerLoading && <div className="jarpis-loading"><span></span><b>Jarpis memuat data...</b></div>}
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
