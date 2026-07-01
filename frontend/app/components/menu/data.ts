// Menu card definitions — shared between menu components
export interface MenuCard {
  id: string;
  name: string;
  category: string;
  description: string;
  logoUrl: string;
  type: "builtin" | "custom";
  url?: string; // for custom cards
}

export const BUILTIN_CARDS: MenuCard[] = [
  { id: "folder", name: "Folder", category: "Utility", description: "Manage local data files.", logoUrl: "https://img.icons8.com/ios-filled/100/89f5ff/folder-invoices.png", type: "builtin" },
  { id: "notepad", name: "Notepad", category: "Utility", description: "Quick note editor.", logoUrl: "https://img.icons8.com/ios-filled/100/89f5ff/document.png", type: "builtin" },
  { id: "music", name: "Spotify", category: "Music", description: "Play and control music.", logoUrl: "https://img.icons8.com/ios-filled/100/1db954/spotify.png", type: "builtin", url: "https://open.spotify.com" },
  { id: "video", name: "YouTube", category: "Video", description: "Watch trending videos.", logoUrl: "https://img.icons8.com/ios-filled/100/ff0000/youtube-play.png", type: "builtin", url: "https://www.youtube.com/channel/UCYfdidRxbB8Qhf0Nx7ioOYw" },
  { id: "google", name: "Google", category: "Search", description: "Search the web.", logoUrl: "https://img.icons8.com/color/100/google-logo.png", type: "builtin", url: "https://www.google.com/webhp?igu=1" },
];

const STORAGE_KEY = "anta_custom_cards";

export function loadCustomCards(): MenuCard[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function saveCustomCards(cards: MenuCard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function getAllCards(): MenuCard[] {
  return [...BUILTIN_CARDS, ...loadCustomCards()];
}

export function getApiUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")
    ? "http://127.0.0.1:8000"
    : (process.env.NEXT_PUBLIC_API_URL || "https://jarpis-production-a270.up.railway.app");
}
