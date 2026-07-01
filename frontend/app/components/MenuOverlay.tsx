"use client";

import { useEffect, useRef, useCallback } from "react";

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
  apiUrl: string;
}

/**
 * Menu HUD rendered inline (no iframe).
 * Uses a ref-mounted div and injects the menu HTML+JS directly.
 * ponytail: reuses existing menu logic wholesale instead of rewriting 1500 lines to React components.
 */
export default function MenuOverlay({ open, onClose, apiUrl }: MenuOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const initedRef = useRef(false);

  const cleanup = useCallback(() => {
    initedRef.current = false;
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Load GSAP if not already loaded
    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });

    const init = async () => {
      if (!scriptLoadedRef.current) {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/Flip.min.js");
        scriptLoadedRef.current = true;
      }

      if (initedRef.current) return;
      initedRef.current = true;

      // Fetch the menu HTML and inject it
      const res = await fetch(`/menu/index.html?v=${Date.now()}`);
      const html = await res.text();

      // Extract body content and the main <script> block
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (!bodyMatch) return;

      let bodyContent = bodyMatch[1];
      
      // Remove the GSAP script tags (already loaded globally)
      bodyContent = bodyContent.replace(/<script[^>]*gsap[^>]*><\/script>/gi, "");
      
      // Extract inline script
      const scriptMatch = bodyContent.match(/<script>([\s\S]*)<\/script>/);
      const scriptContent = scriptMatch ? scriptMatch[1] : "";
      
      // Remove script from body content
      bodyContent = bodyContent.replace(/<script>[\s\S]*<\/script>/, "");

      // Inject HTML
      container.innerHTML = bodyContent;

      // Override the parentApi variable and inject close handler
      if (scriptContent) {
        const modifiedScript = scriptContent
          .replace(
            /const parentApi = [^;]+;/,
            `const parentApi = "${apiUrl}";`
          );

        // Execute the script in context
        try {
          const fn = new Function(modifiedScript);
          fn();
        } catch (e) {
          console.warn("Menu script error:", e);
        }
      }

      // Override the anta-orb button to close menu instead of voice
      setTimeout(() => {
        const orbBtn = container.querySelector("#anta-orb-btn");
        if (orbBtn) {
          orbBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            onClose();
          });
        }
      }, 200);
    };

    init();

    return cleanup;
  }, [open, apiUrl, onClose, cleanup]);

  // Listen for close command from menu script
  useEffect(() => {
    if (!open) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "anta-close-menu") {
        onClose();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="menu-overlay-inline">
      <div ref={containerRef} className="menu-container-inline" />
      <button
        className="menu-close-btn"
        onClick={onClose}
        type="button"
        aria-label="Tutup menu"
      >
        ✕
      </button>
    </div>
  );
}
