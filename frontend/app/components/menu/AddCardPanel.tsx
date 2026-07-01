"use client";

import { useState } from "react";
import { type MenuCard, loadCustomCards, saveCustomCards } from "./data";

interface AddCardPanelProps {
  apiUrl: string;
  onCardAdded: () => void;
}

export default function AddCardPanel({ apiUrl, onCardAdded }: AddCardPanelProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ title: string; logo: string } | null>(null);

  async function scrapeMetadata() {
    if (!url.trim()) return;
    setLoading(true);
    setStatus("Mengambil info website...");
    try {
      // Use backend proxy to scrape title + favicon
      const res = await fetch(`${apiUrl}/proxy?url=${encodeURIComponent(url.trim())}`);
      const html = await res.text();
      
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
      
      // Extract favicon
      const domain = new URL(url.startsWith("http") ? url : `https://${url}`).origin;
      const faviconMatch = html.match(/rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)/i)
        || html.match(/href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon/i);
      let logo = faviconMatch ? faviconMatch[1] : `${domain}/favicon.ico`;
      if (logo.startsWith("/")) logo = domain + logo;
      if (!logo.startsWith("http")) logo = domain + "/" + logo;
      
      setPreview({ title, logo });
      if (!name) setName(title.split(" - ")[0].split(" | ")[0].trim().slice(0, 30));
      setStatus("");
    } catch {
      // Fallback: use Google favicon API
      const domain = url.includes("://") ? new URL(url).hostname : url.split("/")[0];
      setPreview({
        title: domain,
        logo: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
      });
      if (!name) setName(domain.replace("www.", "").split(".")[0]);
      setStatus("");
    }
    setLoading(false);
  }

  function addCard() {
    if (!name.trim()) return;
    const domain = url.includes("://") ? new URL(url).hostname : url.split("/")[0];
    const card: MenuCard = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      category: "Custom",
      description: url.trim(),
      logoUrl: preview?.logo || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      type: "custom",
      url: url.startsWith("http") ? url : `https://${url}`,
    };
    const existing = loadCustomCards();
    saveCustomCards([...existing, card]);
    setUrl("");
    setName("");
    setPreview(null);
    setStatus("Card ditambahkan!");
    onCardAdded();
  }

  return (
    <div className="panel-addcard">
      <h3>Tambah Card Baru</h3>
      <p className="panel-muted">Masukkan URL website. Anta akan mengambil logo dan nama otomatis.</p>

      <div className="panel-addcard-form">
        <div className="panel-addcard-row">
          <input
            className="panel-input"
            placeholder="URL website (contoh: bilibili.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scrapeMetadata()}
          />
          <button className="panel-btn-primary" onClick={scrapeMetadata} disabled={loading}>
            {loading ? "..." : "Ambil Info"}
          </button>
        </div>

        {preview && (
          <div className="panel-addcard-preview">
            <img src={preview.logo} alt="" width={48} height={48} className="panel-addcard-logo" />
            <div>
              <div className="panel-addcard-title">{preview.title}</div>
              <div className="panel-muted">{url}</div>
            </div>
          </div>
        )}

        <input
          className="panel-input"
          placeholder="Nama card (opsional, auto dari website)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button className="panel-btn-primary" onClick={addCard} disabled={!name.trim() && !preview}>
          + Tambah Card
        </button>

        {status && <div className="panel-status">{status}</div>}
      </div>

      {/* List existing custom cards */}
      <div className="panel-addcard-list">
        <h4>Custom Cards</h4>
        {loadCustomCards().length === 0 && <span className="panel-muted">Belum ada custom card</span>}
        {loadCustomCards().map((c) => (
          <div key={c.id} className="panel-addcard-item">
            <img src={c.logoUrl} alt="" width={24} height={24} />
            <span>{c.name}</span>
            <button className="panel-btn-danger-sm" onClick={() => {
              saveCustomCards(loadCustomCards().filter(x => x.id !== c.id));
              onCardAdded();
            }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
