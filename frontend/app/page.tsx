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

function searchUrl(kind: string, query: string) {
  const q = encodeURIComponent(query);
  if (kind === "berita") return `https://www.bing.com/news/search?q=${q}`;
  if (kind === "gambar") return `https://www.bing.com/images/search?q=${q}`;
  if (kind === "lagu") return `https://www.youtube.com/results?search_query=${q}`;
  return `https://duckduckgo.com/?q=${q}`;
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
    url: "https://duckduckgo.com/?q=jarvis+futuristic+hud+ui",
    note: "Panel ini membuka website/search. Jika situs memblokir embed, gunakan tombol buka tab.",
  });

  const chips = useMemo(() => ["/buka wikipedia.org", "/berita AI hari ini", "/gambar jarvis hud", "/lagu lofi malam", "Bantu outline novel"], []);

  async function handle(text: string) {
    const lower = text.toLowerCase();
    const parts = text.split(/\s+/);
    const cmd = parts[0].replace("/", "");
    const rest = text.slice(parts[0].length).trim();

    if (["buka", "open"].includes(cmd) && rest) {
      const url = withProtocol(rest);
      setView({ title: `Buka: ${rest}`, url, note: "Jika layar kosong, situs ini memblokir iframe. Klik buka tab." });
      return `Saya buka ${rest} di panel kanan.`;
    }

    if (["cari", "web", "berita", "gambar", "lagu"].includes(cmd) && rest) {
      const kind = cmd === "cari" || cmd === "web" ? "web" : cmd;
      const url = searchUrl(kind, rest);
      setView({ title: `${kind.toUpperCase()}: ${rest}`, url, note: "Hasil pencarian dibuka di panel. Klik buka tab jika diblokir." });
      return `Saya cari ${kind}: ${rest}`;
    }

    if (lower.startsWith("buka ")) {
      const url = withProtocol(text.slice(5).trim());
      setView({ title: `Buka: ${text.slice(5).trim()}`, url, note: "Jika layar kosong, klik buka tab." });
      return `Saya buka ${text.slice(5).trim()} di panel kanan.`;
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
        <header><b>{view.title}</b><a href={view.url} target="_blank">Buka tab</a></header>
        <p>{view.note}</p>
        <iframe src={view.url} title={view.title} />
      </section>
    </main>
  );
}
