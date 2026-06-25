"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Message = { role: "user" | "ai"; text: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function saveMessage(role: string, text: string) {
  if (!supabase) return;
  await supabase.from("chat_messages").insert({ role, content: text });
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Halo, saya Jarpis. Mau menulis apa hari ini?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "" }]);
    await saveMessage("user", text);

    try {
      let answer = "";

      if (apiUrl) {
        const res = await fetch(`${apiUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (!res.ok || !res.body) throw new Error("Backend tidak menjawab");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value);
          setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: answer } : msg)));
        }
      } else {
        throw new Error("NEXT_PUBLIC_API_URL belum diisi.");
      }

      await saveMessage("ai", answer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error tidak diketahui";
      setMessages((m) => m.map((item, i) => (i === m.length - 1 ? { role: "ai", text: msg } : item)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="top">
          <div className="brand"><span className="orb" /> JARPIS</div>
          <div className="status">{loading ? "Thinking..." : "Online"}</div>
        </header>

        <div className="chat">
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role === "user" ? "user" : "ai"}`}>{msg.text}</div>
          ))}
        </div>

        <form className="form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tulis pesan untuk Jarpis..." />
          <button disabled={loading || !input.trim()}>Kirim</button>
        </form>
        <div className="hint">Supabase opsional: chat tetap jalan walau env Supabase belum diisi.</div>
      </section>
    </main>
  );
}
