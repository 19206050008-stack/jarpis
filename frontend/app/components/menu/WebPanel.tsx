"use client";

import { type MenuCard } from "./data";

interface WebPanelProps {
  card: MenuCard;
  apiUrl: string;
}

// Spotify and YouTube block direct iframe embedding of their main site.
// Use their official embed URLs instead.
function getEmbedUrl(card: MenuCard): string {
  switch (card.id) {
    case "music":
      return "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0";
    case "video":
      return "https://www.youtube.com/channel/UCYfdidRxbB8Qhf0Nx7ioOYw";
    case "google":
      // Google allows embedding via webhp?igu=1
      return "https://www.google.com/webhp?igu=1";
    default:
      return card.url || "";
  }
}

function needsSandbox(card: MenuCard): boolean {
  return !["music", "video"].includes(card.id);
}

export default function WebPanel({ card }: WebPanelProps) {
  const embedUrl = getEmbedUrl(card);
  const originalUrl = card.url || embedUrl;

  return (
    <div className="panel-embed">
      <div className="panel-embed-bar">
        <img src={card.logoUrl} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
        <span>{card.name}</span>
        <span className="panel-login-hint">⚠️ Login di browser jika diperlukan</span>
        <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="panel-btn-sm">Buka di tab baru ↗</a>
      </div>
      <iframe
        src={embedUrl}
        className="panel-embed-frame"
        title={card.name}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        {...(needsSandbox(card) ? { sandbox: "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" } : {})}
      />
    </div>
  );
}
