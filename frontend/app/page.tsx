"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Message = { role: "user" | "ai"; text: string };
type View = { title: string; url: string; note: string };

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

async function askAi(text: string) {
  const prompt = `Kamu Jarpis, asisten AI penulisan novel berbahasa Indonesia. Jawab ringkas, praktis, dan berguna.\n\nUser: ${text}`;
  const url = `https://text.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=openai`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("AI tidak menjawab");
  return res.text();
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Halo, saya Jarpis. Pakai /buka, /cari, /berita, /gambar, /lagu, atau langsung chat." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({
    title: "Jarpis HUD",
    url: "",
    note: "Gunakan perintah di panel tengah untuk membuka website/search.",
  });
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [speaker, setSpeaker] = useState("sari");
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [videos, setVideos] = useState<{ id: string; title: string; url: string }[]>([]);
  const [news, setNews] = useState<{ title: string; link: string; source: string }[]>([]);
  const [showIframe, setShowIframe] = useState(false);

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

  const ttsUrl = process.env.NEXT_PUBLIC_TTS_URL || process.env.NEXT_PUBLIC_API_URL;

  const chips = useMemo(() => ["/buka wikipedia.org", "/berita AI hari ini", "/gambar jarvis hud", "/lagu lofi malam", "Bantu outline novel"], []);

  async function handle(text: string) {
    const lower = text.toLowerCase();
    const parts = text.split(/\s+/);
    const cmd = parts[0].replace("/", "");
    const rest = text.slice(parts[0].length).trim();
    const baseApi = apiUrl || "";

    setVideos([]);
    setNews([]);
    setShowIframe(false);

    if (["buka", "open"].includes(cmd) && rest) {
      const targetUrl = withProtocol(rest);
      const proxied = `${baseApi}/proxy?url=${encodeURIComponent(targetUrl)}`;
      setView({ title: `Buka: ${rest}`, url: proxied, note: "Website dimuat via Jarpis Secure Proxy." });
      setShowIframe(true);
      return `Saya membuka website ${rest} via secure proxy di panel kanan.`;
    }

    if (cmd === "berita" && rest) {
      try {
        const res = await fetch(`${baseApi}/news?q=${encodeURIComponent(rest)}`);
        if (res.ok) {
          const list = await res.json();
          setNews(list);
          setView({ title: `Berita: ${rest}`, url: "", note: "Menampilkan 10 berita terhangat." });
          return `Berikut berita terhangat terkait '${rest}' di panel kanan.`;
        }
      } catch (err) {
        console.error("News fetch error", err);
      }
    }

    if (cmd === "lagu" && rest) {
      try {
        const res = await fetch(`${baseApi}/videos?q=${encodeURIComponent(rest)}`);
        if (res.ok) {
          const list = await res.json();
          setVideos(list);
          setView({ title: `Lagu/Video: ${rest}`, url: "", note: "Pilih video untuk diputar langsung di panel." });
          return `Saya carikan video/lagu terkait '${rest}' di panel kanan.`;
        }
      } catch (err) {
        console.error("Video fetch error", err);
      }
    }

    if (["cari", "web", "gambar"].includes(cmd) && rest) {
      const kind = cmd === "cari" || cmd === "web" ? "web" : cmd;
      const targetUrl = searchUrl(kind, rest, baseApi);
      setView({ title: `${kind.toUpperCase()}: ${rest}`, url: targetUrl, note: "Pencarian dimuat via Jarpis Secure Proxy." });
      setShowIframe(true);
      return `Saya cari ${kind} '${rest}' di panel kanan.`;
    }

    if (lower.startsWith("buka ")) {
      const site = text.slice(5).trim();
      const targetUrl = withProtocol(site);
      const proxied = `${baseApi}/proxy?url=${encodeURIComponent(targetUrl)}`;
      setView({ title: `Buka: ${site}`, url: proxied, note: "Website dimuat via Jarpis Secure Proxy." });
      setShowIframe(true);
      return `Saya membuka website ${site} via secure proxy.`;
    }

    return askAi(text);
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "" }]);
    await saveMessage("user", text);

    try {
      const answer = await handle(text);
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: answer } : msg)));
      await saveMessage("ai", answer);

      if (speakEnabled && ttsUrl && !text.startsWith("/")) {
        try {
          const speakRes = await fetch(`${ttsUrl}/speak`, {
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
    <main className="hud">
      <aside className="side">
        <div className="logo"><span className="orb" /> JARPIS</div>
        <button onClick={() => setInput("/buka ")}>Buka Website</button>
        <button onClick={() => setInput("/berita ")}>Cari Berita</button>
        <button onClick={() => setInput("/gambar ")}>Cari Gambar</button>
        <button onClick={() => setInput("/lagu ")}>Cari Lagu</button>
        <button onClick={() => setInput("Bantu buat outline novel tentang ")}>Novel</button>

        <div className="tts-box">
          <label>
            <input type="checkbox" checked={speakEnabled} onChange={(e) => setSpeakEnabled(e.target.checked)} />
            Suara Jarpis
          </label>
          <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {audioUrl && <audio src={audioUrl} autoPlay controls style={{ width: "100%", marginTop: "10px" }} />}
        </div>
      </aside>

      <section className="center">
        <div className="scanner"><span /></div>
        <div className="chat">
          {messages.map((msg, i) => <div key={i} className={`msg ${msg.role}`}>{msg.text}</div>)}
        </div>
        <div className="chips">{chips.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
        <form className="form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Perintah atau chat... contoh: /gambar kota futuristik" />
          <button disabled={loading || !input.trim()}>{loading ? "..." : "Kirim"}</button>
        </form>
      </section>

      <section className="viewer">
        <header>
          <b>{view.title}</b>
          {view.url && <a href={view.url.includes("proxy?url=") ? decodeURIComponent(view.url.split("proxy?url=")[1]) : view.url} target="_blank" rel="noreferrer">Buka tab</a>}
        </header>
        <p>{view.note}</p>
        
        {showIframe && view.url && <iframe src={view.url} title={view.title} />}
        
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
      </section>
    </main>
  );
}
