import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

type IconName = "close" | "expand" | "zoom" | "download" | "similar" | "play" | "read" | "spark" | "source";

export function Icon({ name }: { name: IconName }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    expand: <><path d="M8 3H3v5" /><path d="M16 3h5v5" /><path d="M21 16v5h-5" /><path d="M3 16v5h5" /></>,
    zoom: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    similar: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /><path d="M14 4h6v6" /><path d="M20 4 13 11" /></>,
    play: <path d="m8 5 11 7-11 7V5z" />,
    read: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></>,
    spark: <><path d="M12 2v5" /><path d="M12 17v5" /><path d="M4.22 4.22l3.54 3.54" /><path d="M16.24 16.24l3.54 3.54" /><path d="M2 12h5" /><path d="M17 12h5" /><path d="M4.22 19.78l3.54-3.54" /><path d="M16.24 7.76l3.54-3.54" /></>,
    source: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export function IconButton({ icon, label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button {...props} className={`anta-icon-btn ${className}`} title={label} aria-label={label}><Icon name={icon} /></button>;
}

export function ActionButton({ icon, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  return <button {...props} className={`anta-btn ${className}`}>{icon && <Icon name={icon} />}<span>{children}</span></button>;
}

export function ActionLink({ icon, children, className = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { icon?: IconName }) {
  return <a {...props} className={`anta-btn ${className}`}>{icon && <Icon name={icon} />}<span>{children}</span></a>;
}
