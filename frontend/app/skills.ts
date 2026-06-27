export const SKILLS = [
  { id: "chat", label: "Chat", hint: "Buka panel chat" },
  { id: "voice", label: "Voice", hint: "Mulai perintah suara" },
  { id: "news", label: "Berita hari ini", hint: "Cari berita terbaru" },
  { id: "image", label: "Cari gambar", hint: "Cari gambar dengan Anta" },
  { id: "planner", label: "Task planner", hint: "Buat checklist kerja" },
  { id: "memory", label: "Memory", hint: "Buka dashboard memori" },
  { id: "monitoring", label: "Monitoring", hint: "Buka monitoring API" },
  { id: "lock-orb", label: "Kunci orb", hint: "Orb tidak bisa digeser" },
  { id: "free-orb", label: "Bebaskan orb", hint: "Orb bisa digeser" },
] as const;

export type SkillId = typeof SKILLS[number]["id"];
