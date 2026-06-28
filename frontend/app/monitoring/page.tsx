"use client";

import { useEffect, useState } from "react";

type Provider = {
  order: number;
  name: string;
  model: string;
  capabilities: string[];
  active: boolean;
  usable: boolean;
  latency_s: number | null;
  credit: unknown;
  models_count: number | null;
  models: string[];
  reason: string;
};

type Monitoring = {
  default_provider: Provider | null;
  usable_by_speed: Provider[];
  unusable: Provider[];
  providers: Provider[];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app";

function creditText(value: unknown) {
  if (!value) return "tidak tersedia";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function MonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  async function load(nextToken = token) {
    if (!apiUrl) return setError("NEXT_PUBLIC_API_URL belum diset.");
    setError("");
    const res = await fetch(`${apiUrl}/monitoring`, {
      cache: "no-store",
      headers: nextToken ? { "x-monitoring-token": nextToken } : {},
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (nextToken) localStorage.setItem("anta_monitoring_token", nextToken);
    setData(await res.json());
  }

  useEffect(() => {
    const saved = localStorage.getItem("anta_monitoring_token") || "";
    setToken(saved);
    load(saved).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#06111f", color: "#d8faff", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ color: "#67e8f9" }}>Anta API Monitoring</h1>
      <p>Backend: {apiUrl || "-"}</p>
      <form onSubmit={(e) => { e.preventDefault(); load().catch((err) => setError(err.message)); }} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Monitoring token" style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #164e63", background: "#020617", color: "#d8faff" }} />
        <button style={{ padding: "10px 16px", borderRadius: 8, border: 0, background: "#0891b2", color: "white" }}>Load</button>
      </form>
      {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      {!data && !error && <p>Memeriksa semua provider...</p>}
      {data && (
        <>
          <section style={{ margin: "20px 0", padding: 16, border: "1px solid #164e63", borderRadius: 12 }}>
            <h2>Default tercepat</h2>
            <p>{data.default_provider ? `${data.default_provider.name} / ${data.default_provider.model} (${data.default_provider.latency_s}s)` : "Tidak ada provider aktif."}</p>
          </section>

          <h2>Urutan provider</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#67e8f9", textAlign: "left" }}>
                  <th>#</th><th>Provider</th><th>Model default</th><th>Status</th><th>Speed</th><th>Credit/token</th><th>Model</th><th>Kemampuan</th><th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={`${p.order}-${p.name}-${p.model}`} style={{ borderTop: "1px solid #164e63" }}>
                    <td>{p.order}</td>
                    <td>{p.name}</td>
                    <td>{p.model}</td>
                    <td style={{ color: p.usable && p.active ? "#86efac" : "#fb7185" }}>{p.active ? (p.usable ? "bisa dipakai" : "gagal") : "dimatikan"}</td>
                    <td>{p.latency_s ?? "-"}s</td>
                    <td>{creditText(p.credit)}</td>
                    <td>{p.models_count ?? p.models.length} model<br /><small>{p.models.slice(0, 6).join(", ")}</small></td>
                    <td>{p.capabilities.join(", ")}</td>
                    <td style={{ maxWidth: 360, color: "#bae6fd" }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Tidak dipakai / perlu dihapus dari env kalau tetap gagal</h2>
          <ul>{data.unusable.map((p) => <li key={`${p.name}-${p.model}`}>{p.name}: {p.reason}</li>)}</ul>
        </>
      )}
    </main>
  );
}
