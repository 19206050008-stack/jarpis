"use client";

import { useEffect, useState } from "react";

type Status = {
  configured: boolean;
  ok: boolean;
  url: string;
  models: string[];
  agents: { key: string; class: string; accepts_tools?: boolean }[];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";
const openJarvisUiUrl = process.env.NEXT_PUBLIC_OPENJARVIS_UI_URL || "";

export default function OpenJarvisPage() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!apiUrl) return setError("NEXT_PUBLIC_API_URL belum diset.");
    fetch(`${apiUrl}/openjarvis/status`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#06111f", color: "#d8faff", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ color: "#67e8f9" }}>OpenJarvis Sync</h1>
      <p>Backend: {apiUrl || "-"}</p>
      {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      {!data && !error && <p>Memeriksa OpenJarvis...</p>}
      {data && (
        <>
          <section style={{ margin: "20px 0", padding: 16, border: "1px solid #164e63", borderRadius: 12 }}>
            <h2>Status</h2>
            <p>{data.configured ? (data.ok ? "Tersambung" : "OpenJarvis tidak merespons") : "OPENJARVIS_URL belum diset"}</p>
            <p>URL API: {data.url || "-"}</p>
            {(openJarvisUiUrl || data.url) && <p><a href={openJarvisUiUrl || data.url} target="_blank" style={{ color: "#67e8f9" }}>Buka UI OpenJarvis</a></p>}
          </section>
          {(openJarvisUiUrl || data.url) && (
            <section style={{ margin: "20px 0", border: "1px solid #164e63", borderRadius: 12, overflow: "hidden", height: "70vh" }}>
              <iframe title="OpenJarvis UI" src={openJarvisUiUrl || data.url} style={{ width: "100%", height: "100%", border: 0, background: "#020617" }} />
            </section>
          )}
          <section style={{ margin: "20px 0", padding: 16, border: "1px solid #164e63", borderRadius: 12 }}>
            <h2>Models</h2>
            <ul>{data.models.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
          <section style={{ margin: "20px 0", padding: 16, border: "1px solid #164e63", borderRadius: 12 }}>
            <h2>Agents</h2>
            <ul>{data.agents.map((a) => <li key={a.key}>{a.key} — {a.class}{a.accepts_tools ? " (tools)" : ""}</li>)}</ul>
          </section>
        </>
      )}
    </main>
  );
}
