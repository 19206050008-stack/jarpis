"use client";

import { useState, useEffect } from "react";

interface FolderPanelProps {
  apiUrl: string;
}

interface FileItem {
  id: number;
  name: string;
  content: string;
  parent_path: string;
  is_folder: boolean;
}

export default function FolderPanel({ apiUrl }: FolderPanelProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("/Document");
  const [activeFile, setActiveFile] = useState<FileItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);

  const fixedFolders = ["/Document", "/Music", "/Pictures", "/Video"];

  useEffect(() => { loadFiles(); }, []);

  async function loadFiles() {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/files`);
      if (res.ok) setFiles(await res.json());
    } catch {}
    setLoading(false);
  }

  const folders = [...new Set([...fixedFolders, ...files.filter(f => f.is_folder).map(f => "/" + f.name.replace(/^\/+|\/+$/g, ""))])];
  const currentFiles = files.filter(f => f.parent_path === currentPath && !f.is_folder);

  function openFile(f: FileItem) {
    setActiveFile(f);
    setEditing(false);
  }

  function startEdit(f?: FileItem) {
    setEditing(true);
    setEditName(f?.name || "");
    setEditContent(f?.content || "");
  }

  async function saveFile() {
    if (!editName.trim()) return;
    await fetch(`${apiUrl}/api/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeFile?.id || null, name: editName, content: editContent, parent_path: currentPath, is_folder: false }),
    });
    setEditing(false);
    loadFiles();
  }

  async function deleteFile() {
    if (!activeFile?.id) return;
    await fetch(`${apiUrl}/api/files/${activeFile.id}`, { method: "DELETE" });
    setActiveFile(null);
    loadFiles();
  }

  function fileIcon(name: string) {
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "🖼️";
    if (/\.(mp4|webm|mov)$/i.test(name)) return "🎥";
    if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return "🎵";
    if (/\.md$/i.test(name)) return "📝";
    return "📄";
  }

  return (
    <div className="panel-folder">
      <div className="panel-sidebar">
        <div className="panel-sidebar-title">Folders</div>
        {folders.map((path) => (
          <button key={path} className={`panel-list-item ${currentPath === path ? "active" : ""}`} onClick={() => setCurrentPath(path)}>
            📁 {path.replace("/", "")}
          </button>
        ))}
      </div>
      <div className="panel-main">
        <div className="panel-toolbar">
          <span className="panel-path">📁 {currentPath.replace("/", "")}</span>
          <button className="panel-btn-sm" onClick={() => { setActiveFile(null); startEdit(); }}>+ New File</button>
        </div>

        {editing ? (
          <div className="panel-editor">
            <input className="panel-input" placeholder="File Name..." value={editName} onChange={(e) => setEditName(e.target.value)} />
            <textarea className="panel-textarea" placeholder="Content..." value={editContent} onChange={(e) => setEditContent(e.target.value)} />
            <div className="panel-actions">
              <button className="panel-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="panel-btn-primary" onClick={saveFile}>Save</button>
            </div>
          </div>
        ) : activeFile ? (
          <div className="panel-preview">
            <div className="panel-preview-header">
              <span>{fileIcon(activeFile.name)} {activeFile.name}</span>
              <div>
                <button className="panel-btn-sm" onClick={() => startEdit(activeFile)}>Edit</button>
                <button className="panel-btn-danger-sm" onClick={deleteFile}>Delete</button>
              </div>
            </div>
            <pre className="panel-preview-content">{activeFile.content || "(empty)"}</pre>
          </div>
        ) : (
          <div className="panel-grid">
            {loading && <span className="panel-muted">Loading...</span>}
            {!loading && currentFiles.length === 0 && <span className="panel-muted">Folder empty</span>}
            {currentFiles.map((f) => (
              <button key={f.id} className="panel-grid-item" onClick={() => openFile(f)}>
                <span className="panel-grid-icon">{fileIcon(f.name)}</span>
                <span className="panel-grid-name">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
