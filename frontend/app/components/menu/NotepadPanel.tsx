"use client";

import { useState, useEffect } from "react";

interface NotepadPanelProps {
  apiUrl: string;
}

interface Note {
  id: number;
  title: string;
  content: string;
}

export default function NotepadPanel({ apiUrl }: NotepadPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadNotes(); }, []);

  async function loadNotes() {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/notes`);
      if (res.ok) setNotes(await res.json());
    } catch {}
    setLoading(false);
  }

  function openNote(n: Note) {
    setActiveNote(n);
    setTitle(n.title);
    setBody(n.content || "");
    setEditing(false);
  }

  function newNote() {
    setActiveNote(null);
    setTitle("");
    setBody("");
    setEditing(true);
  }

  async function saveNote() {
    if (!title.trim()) return;
    const res = await fetch(`${apiUrl}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeNote?.id || null, title, content: body }),
    });
    if (res.ok) {
      const saved = await res.json();
      setActiveNote(saved);
      setEditing(false);
      loadNotes();
    }
  }

  async function deleteNote() {
    if (!activeNote?.id) return;
    await fetch(`${apiUrl}/api/notes/${activeNote.id}`, { method: "DELETE" });
    setActiveNote(null);
    setTitle("");
    setBody("");
    setEditing(false);
    loadNotes();
  }

  return (
    <div className="panel-notepad">
      {/* Sidebar: list of notes */}
      <div className="panel-sidebar">
        <button className="panel-btn-primary panel-btn-full" onClick={newNote}>+ Buat Catatan</button>
        <div className="panel-list">
          {loading && <span className="panel-muted">Loading...</span>}
          {!loading && notes.length === 0 && <span className="panel-muted">Belum ada catatan</span>}
          {notes.map((n) => (
            <button key={n.id} className={`panel-list-item ${activeNote?.id === n.id ? "active" : ""}`} onClick={() => openNote(n)}>
              {n.title || "Untitled"}
            </button>
          ))}
        </div>
      </div>

      {/* Main: view or edit */}
      <div className="panel-main">
        {!activeNote && !editing ? (
          <div className="panel-empty">
            <span className="panel-muted">Pilih catatan di sidebar atau buat baru</span>
          </div>
        ) : editing ? (
          <>
            <input
              className="panel-input"
              placeholder="Judul catatan..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="panel-textarea"
              placeholder="Tulis catatan di sini..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              autoFocus
            />
            <div className="panel-actions">
              {activeNote && <button className="panel-btn-danger" onClick={deleteNote}>Hapus</button>}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="panel-btn-sm" onClick={() => { if (activeNote) { setEditing(false); setTitle(activeNote.title); setBody(activeNote.content); } else { setEditing(false); } }}>Batal</button>
                <button className="panel-btn-primary" onClick={saveNote}>Simpan</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-note-view-header">
              <h3>{activeNote?.title}</h3>
              <button className="panel-btn-sm" onClick={() => setEditing(true)}>✏️ Edit</button>
            </div>
            <pre className="panel-note-content">{activeNote?.content || "(kosong)"}</pre>
            <div className="panel-actions">
              <button className="panel-btn-danger" onClick={deleteNote}>Hapus</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
