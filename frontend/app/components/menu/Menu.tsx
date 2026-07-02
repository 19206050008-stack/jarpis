"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { getAllCards, getApiUrl, type MenuCard } from "./data";
import NotepadPanel from "./NotepadPanel";
import FolderPanel from "./FolderPanel";
import AddCardPanel from "./AddCardPanel";
import WebPanel from "./WebPanel";

interface MenuProps {
  open: boolean;
  onClose: () => void;
  openCardId?: string | null;
  subtitle: string;
  subtitleState: string;
  extraCard?: MenuCard | null;
}

const GAP_X = 320;
const STEP_Z = -80;

const ADD_CARD: MenuCard = { id: "__add__", name: "+ Tambah", category: "Custom", description: "Tambah card baru", logoUrl: "https://img.icons8.com/ios-glyphs/100/ffffff/plus.png", type: "builtin" };

export default function Menu({ open, onClose, openCardId, subtitle, subtitleState, extraCard }: MenuProps) {
  const allCards = useCallback(() => [...getAllCards(), ...(extraCard ? [extraCard] : []), ADD_CARD], [extraCard]);
  const [cards, setCards] = useState<MenuCard[]>(allCards());
  const [activeIdx, setActiveIdx] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelCardId, setPanelCardId] = useState<string | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const apiUrl = getApiUrl();

  function refreshCards() {
    setCards(allCards());
  }

  useEffect(() => {
    setCards(allCards());
  }, [allCards]);

  // Navigate to card
  const setActive = useCallback((idx: number, instant = false) => {
    const clamped = Math.max(0, Math.min(idx, cards.length - 1));
    setActiveIdx(clamped);
    if (pipelineRef.current) {
      gsap.to(pipelineRef.current, {
        x: -(clamped * GAP_X),
        z: -(clamped * STEP_Z),
        duration: instant ? 0 : 0.8,
        ease: "power3.inOut",
      });
    }
  }, []);

  // Auto-open card when openCardId changes
  useEffect(() => {
    if (open && openCardId) {
      const idx = cards.findIndex(c => c.id === openCardId);
      if (idx >= 0) {
        setActive(idx, true);
        setTimeout(() => {
          setPanelCardId(openCardId);
          setPanelOpen(true);
        }, 300);
      }
    }
  }, [open, openCardId, cards, setActive]);

  // Init card positions
  useEffect(() => {
    if (!open) return;
    cardsRef.current.forEach((card, i) => {
      if (card) {
        gsap.set(card, { x: i * GAP_X, y: 0, z: i * STEP_Z });
      }
    });
    setActive(activeIdx, true);
  }, [open, setActive, activeIdx]);

  // Mouse parallax → scene 3D rotation
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5);
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const tick = () => {
      if (!sceneRef.current || panelOpen) return;
      gsap.to(sceneRef.current, {
        rotationX: 25 + mouseRef.current.y * 10,
        rotationY: -20 + mouseRef.current.x * 15,
        duration: 1,
        ease: "power1.out",
      });
    };
    const id = setInterval(tick, 50);
    return () => { window.removeEventListener("mousemove", onMove); clearInterval(id); };
  }, [open, panelOpen]);

  // Swipe / keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (panelOpen && e.key === "Escape") { closePanel(); return; }
      if (e.key === "ArrowRight") setActive(activeIdx + 1);
      if (e.key === "ArrowLeft") setActive(activeIdx - 1);
      if (e.key === "Enter" && !panelOpen) openPanel(activeIdx);
      if (e.key === "Escape" && !panelOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIdx, panelOpen, setActive, onClose]);

  // Touch swipe
  useEffect(() => {
    if (!open) return;
    let startX = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0]?.clientX || 0; };
    const onEnd = (e: TouchEvent) => {
      const diff = (e.changedTouches[0]?.clientX || 0) - startX;
      if (Math.abs(diff) > 40) {
        if (diff < 0) setActive(activeIdx + 1);
        else setActive(activeIdx - 1);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => { window.removeEventListener("touchstart", onStart); window.removeEventListener("touchend", onEnd); };
  }, [open, activeIdx, setActive]);

  // Reset on close
  useEffect(() => {
    if (!open) { setPanelOpen(false); setPanelCardId(null); }
  }, [open]);

  function openPanel(idx: number) {
    setActiveIdx(idx);
    setPanelCardId(cards[idx].id);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => setPanelCardId(null), 300);
  }

  // Card mouse tilt
  function handleCardMove(e: React.MouseEvent, cardEl: HTMLDivElement | null) {
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(cardEl, { "--tilt-x": `${x * 20}deg`, "--tilt-y": `${-y * 20}deg`, duration: 0.4, ease: "power2.out" });
  }
  function handleCardLeave(cardEl: HTMLDivElement | null) {
    if (!cardEl) return;
    gsap.to(cardEl, { "--tilt-x": "0deg", "--tilt-y": "0deg", duration: 0.4 });
  }

  function renderPanel() {
    if (panelCardId === "__add__") return <AddCardPanel apiUrl={apiUrl} onCardAdded={refreshCards} />;
    const card = cards.find(c => c.id === panelCardId);
    if (!card) return null;
    // Only Folder and Notepad use custom UI, everything else is embedded
    switch (panelCardId) {
      case "notepad": return <NotepadPanel apiUrl={apiUrl} />;
      case "folder": return <FolderPanel apiUrl={apiUrl} />;
      default: return <WebPanel card={card} apiUrl={apiUrl} />;
    }
  }

  if (!open) return null;

  return (
    <div className="menu-screen">
      {/* Floor grid */}
      <div className="menu-floor-grid" />

      {/* 3D Scene */}
      <div className="menu-viewport">
        <div className={`menu-scene ${panelOpen ? "is-panel-open" : ""}`} ref={sceneRef}>
          <div className="menu-pipeline" ref={pipelineRef}>
            {cards.map((card, i) => (
              <div
                key={card.id}
                ref={el => { cardsRef.current[i] = el; }}
                className={`menu-card-3d ${i === activeIdx ? "is-active" : ""}`}
                onClick={() => { if (!panelOpen) openPanel(i); }}
                onMouseMove={(e) => handleCardMove(e, cardsRef.current[i])}
                onMouseLeave={() => handleCardLeave(cardsRef.current[i])}
              >
                {/* Progress ring */}
                <svg className="menu-card-ring" viewBox="0 0 100 100">
                  <circle className="ring-bg" cx="50" cy="50" r="45" />
                  <circle className="ring-fg" cx="50" cy="50" r="45" strokeDasharray={`${2 * Math.PI * 45}`} strokeDashoffset="0" />
                </svg>
                {/* Particles */}
                <div className="menu-card-particles">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <span key={j} className="particle" style={{ left: `${20 + j * 12}%`, top: `${25 + (j % 3) * 22}%`, animationDelay: `${j * 0.3}s` }} />
                  ))}
                </div>
                {/* Energy orbit */}
                <div className="menu-card-orbit" />
                {/* Content */}
                <div className="menu-card-content">
                  <div className="menu-card-header">
                    <span className="menu-card-name">{card.name}</span>
                    <span className="menu-card-cat">{card.category}</span>
                  </div>
                  <div className="menu-card-visuals">
                    <div className="menu-card-icon-wrap">
                      <img src={card.logoUrl} alt={card.name} width={80} height={80} />
                    </div>
                  </div>
                  <div className="menu-card-footer">{card.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <button className="menu-nav menu-nav-left" onClick={() => setActive(activeIdx - 1)} disabled={activeIdx === 0} type="button">‹</button>
      <button className="menu-nav menu-nav-right" onClick={() => setActive(activeIdx + 1)} disabled={activeIdx === cards.length - 1} type="button">›</button>

      {/* Panel */}
      {panelOpen && (
        <div className="menu-panel-overlay">
          <div className="menu-panel-backdrop" onClick={closePanel} />
          <div className="menu-panel">
            <div className="menu-panel-header">
              <h2>{cards.find(c => c.id === panelCardId)?.name} — {cards.find(c => c.id === panelCardId)?.category}</h2>
              <button className="menu-panel-close" onClick={closePanel} type="button">&times;</button>
            </div>
            <div className="menu-panel-body">
              {renderPanel()}
            </div>
          </div>
        </div>
      )}

      {/* Subtitle (benter) */}
      <div className={`menu-subtitle ${subtitleState}`}>{subtitle}</div>

      {/* Close */}
      <button className="menu-close-x" onClick={onClose} type="button">✕ Kembali</button>
    </div>
  );
}
