"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Health = { ok?: boolean; model?: string; uptime_s?: number; memory_mb?: number; tts_available?: boolean };
type Provider = { name: string; model: string; configured: boolean };

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    fetch(`${apiUrl}/health`).then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    fetch(`${apiUrl}/providers`).then((r) => r.json()).then((x) => setProviders(x.chat_router || [])).catch(() => {});
  }, []);

  return (
    <main className="app">
      <section className="panel status-panel">
        <header>
          <div>
            <h1>Status</h1>
            <p>{apiUrl}</p>
          </div>
          <nav><a href="/">Chat</a></nav>
          <span className={health?.ok ? "dot" : "dot busy"} />
        </header>

        <div className="status">
          <div className="card">
            <b>Backend</b>
            <span>{health ? (health.ok ? "Online" : "Offline") : "Memuat..."}</span>
          </div>
          <div className="card"><b>Model</b><span>{health?.model || "-"}</span></div>
          <div className="card"><b>Uptime</b><span>{health?.uptime_s ?? "-"}s</span></div>
          <div className="card"><b>Memory</b><span>{health?.memory_mb ?? "-"} MB</span></div>
          <div className="card"><b>TTS lokal</b><span>{health?.tts_available ? "Ada" : "Tidak"}</span></div>

          <h2>Provider chat</h2>
          {providers.map((p, i) => (
            <div className="provider" key={i}>
              <span>{p.name}</span>
              <small>{p.model}</small>
              <b>{p.configured ? "aktif" : "belum"}</b>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
