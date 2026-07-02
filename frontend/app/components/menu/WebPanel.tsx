"use client";

import { useEffect, useState } from "react";
import { cardMark, type MenuCard } from "./data";

interface WebPanelProps {
  card: MenuCard;
  apiUrl: string;
}

type VideoResult = { id: string; title: string; url?: string };

function getEmbedUrl(card: MenuCard): string {
  switch (card.id) {
    case "music":
      return "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0";
    case "video":
      return "https://www.youtube.com/embed/videoseries?list=UUhLtXXpo4Ge1ReTEboVvTDg";
    case "google":
      return "https://www.google.com/webhp?igu=1";
    default:
      return card.url || "";
  }
}

function needsSandbox(card: MenuCard): boolean {
  return !["music", "video"].includes(card.id) && !card.id.startsWith("youtube-search-");
}

function loginHint(card: MenuCard): string {
  if (card.id === "google" || card.id.startsWith("google-search-")) return "⚠️ Login/verifikasi Google jika diminta";
  if (card.id === "music") return "⚠️ Login Spotify jika diperlukan";
  if (card.id === "video" || card.id.startsWith("youtube-search-")) return "⚠️ Login YouTube jika diperlukan";
  return "⚠️ Login di browser jika diperlukan";
}

function YouTubeSearchPanel({ card, apiUrl }: { card: MenuCard; apiUrl: string }) {
  const params = new URL(card.url || "https://x/?q=").searchParams;
  const query = params.get("q") || params.get("search_query") || "";
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    fetch(`${apiUrl}/videos?q=${encodeURIComponent(query)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setVideos(list);
        setActive(list[0]?.id || "");
      })
      .catch(() => {});
  }, [apiUrl, query]);

  return (
    <div className="panel-youtube-search-embed">
      <div className="panel-youtube-search-player">
        {active ? (
          <iframe
            src={`https://www.youtube.com/embed/${active}`}
            title={query}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          />
        ) : <div className="panel-muted">Mencari video...</div>}
      </div>
      <div className="panel-youtube-search-list">
        {videos.map((v, i) => (
          <button key={`${v.id}-${i}`} onClick={() => setActive(v.id)} className={v.id === active ? "active" : ""} type="button">
            <span>{i + 1}</span>
            <b>{v.title || query}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WebPanel({ card, apiUrl }: WebPanelProps) {
  const embedUrl = getEmbedUrl(card);
  const originalUrl = card.url || embedUrl;
  const isYouTubeSearch = card.id.startsWith("youtube-search-");

  return (
    <div className={`panel-embed panel-embed-${card.id}`}>
      <div className="panel-embed-bar">
        <span className={`panel-embed-mark mark-${card.id.replace(/[^a-z0-9_-]/gi, "")}`}>{cardMark(card)}</span>
        <span>{card.name}</span>
        <span className="panel-login-hint">{loginHint(card)}</span>
        <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="panel-btn-sm">Buka di tab baru ↗</a>
      </div>
      {isYouTubeSearch ? <YouTubeSearchPanel card={card} apiUrl={apiUrl} /> : (
        <iframe
          src={embedUrl}
          className="panel-embed-frame"
          title={card.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          {...(needsSandbox(card) ? { sandbox: "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" } : {})}
        />
      )}
    </div>
  );
}
