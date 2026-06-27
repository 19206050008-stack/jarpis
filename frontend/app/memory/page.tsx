"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type Memory = { id?: string | number; kind?: string; content?: string; created_at?: string };

export default function MemoryPage() {
  const [items, setItems] = useState<Memory[]>([]);
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) return setError("Supabase env belum diset.");
    const { data, error } = await supabase.from("memories").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) setError(error.message);
    else setItems(data || []);
  }

  async function remove(id: Memory["id"]) {
    if (!supabase || id == null) return;
    await supabase.from("memories").delete().eq("id", id);
    await load();
  }

  useEffect(() => { void load(); }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#06111f", color: "#d8faff", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ color: "#67e8f9" }}>Anta Memory</h1>
      {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      <button onClick={load} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #22d3ee55", background: "#083344", color: "#d8faff" }}>Refresh</button>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {items.map((m, i) => (
          <article key={String(m.id ?? i)} style={{ padding: 14, border: "1px solid #164e63", borderRadius: 12, background: "#020617" }}>
            <small style={{ color: "#67e8f9" }}>{m.kind || "memory"} {m.created_at ? `• ${new Date(m.created_at).toLocaleString()}` : ""}</small>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
            {m.id != null && <button onClick={() => remove(m.id)} style={{ padding: "7px 10px", borderRadius: 8, border: 0, background: "#7f1d1d", color: "white" }}>Hapus</button>}
          </article>
        ))}
      </div>
    </main>
  );
}
