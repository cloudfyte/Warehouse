import type { AppSettings } from "@/app/types";

function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

export function applyBrandColors(cfg: Partial<AppSettings>) {
  const root = document.documentElement;
  if (cfg.primaryColor) {
    const p = cfg.primaryColor;
    root.style.setProperty("--primary",     p);
    root.style.setProperty("--primary-2",   lighten(p, 0.12));
    root.style.setProperty("--primary-3",   lighten(p, 0.32));
    root.style.setProperty("--pale-green",  lighten(p, 0.84));
    // Derive a very subtle tint for page backgrounds so the whole UI feels on-theme
    root.style.setProperty("--bg",          lighten(p, 0.97));
    root.style.setProperty("--canvas",      lighten(p, 0.94));
  }
  if (cfg.accentColor) root.style.setProperty("--accent", cfg.accentColor);
}

export function applyDarkMode(dark: boolean) {
  const r = document.documentElement;
  if (dark) {
    // Remove light guard so the prefers-color-scheme media query can apply,
    // then override inline for users whose OS is light but who chose dark.
    r.removeAttribute("data-theme");
    r.style.setProperty("--ink",               "#dce8e1");
    r.style.setProperty("--muted",             "#7a9589");
    r.style.setProperty("--line",              "#243328");
    r.style.setProperty("--canvas",            "#0f1a14");
    r.style.setProperty("--paper",             "#172118");
    r.style.setProperty("--pale-green",        "#1a2d1e");
    r.style.setProperty("--th-bg",             "#1a2820");
    r.style.setProperty("--td-color",          "#c0d4c8");
    r.style.setProperty("--hover-bg",          "#1e2e24");
    r.style.setProperty("--input-bg",          "#1e2e24");
    r.style.setProperty("--topbar-bg",         "rgba(15,26,20,.92)");
    r.style.setProperty("--panel-border",      "#243328");
    r.style.setProperty("--modal-close-color", "#9fb8ac");
  } else {
    // Stamp data-theme="light" to override the prefers-color-scheme dark query
    r.setAttribute("data-theme", "light");
    [
      "--ink", "--muted", "--line", "--canvas", "--paper", "--pale-green",
      "--th-bg", "--td-color", "--hover-bg", "--input-bg", "--topbar-bg",
      "--panel-border", "--modal-close-color",
    ].forEach(v => r.style.removeProperty(v));
  }
}
