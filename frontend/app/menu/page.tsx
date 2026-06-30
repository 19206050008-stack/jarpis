"use client";

import { useEffect, useState } from "react";

export default function MenuDebug() {
  const [src, setSrc] = useState("/menu/index.html");
  useEffect(() => {
    setSrc(`/menu/index.html?v=${Date.now()}`);
  }, []);
  return (
    <div className="menu-shell">
      <iframe src={src} title="HUD Menu Debug" style={{ width: "100%", height: "100dvh", border: 0 }} />
    </div>
  );
}
