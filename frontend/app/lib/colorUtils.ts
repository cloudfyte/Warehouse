/**
 * Turn a colour name into the colour it actually is.
 *
 * This used to hash the name into a hue, which is deterministic and useless:
 * "Cream" came out purple and "Light Green" came out magenta. A swatch that
 * disagrees with the word beside it is worse than no swatch, because the eye
 * trusts the square and the square was lying.
 *
 * Names come off a mill's docket, so they are written however the mill writes
 * them — "off white", "Rani Pink", "pista green", "d.green". Matching is done
 * on the words rather than the whole string for that reason.
 */

/** Colours a garment warehouse actually names, including the trade's own. */
const NAMED: Record<string, string> = {
  white: "#ffffff", offwhite: "#f5f1e6", cream: "#fdf3d8", ivory: "#fffff0",
  beige: "#e8d9b8", sand: "#e3cfa3", khaki: "#c3b091", camel: "#c19a6b",
  black: "#1a1a1a", charcoal: "#36454f", grey: "#9aa0a6", gray: "#9aa0a6",
  silver: "#c0c0c0", steel: "#71797e",

  red: "#d32f2f", maroon: "#7b1e29", wine: "#722f37", rust: "#b7410e",
  cherry: "#a6153c", tomato: "#e04836",

  pink: "#e91e8c", ranipink: "#d5006d", rani: "#d5006d", rose: "#e37383",
  peach: "#ffb59b", salmon: "#fa8072", magenta: "#c2185b", fuchsia: "#c74375",

  orange: "#ef6c00", mustard: "#d4a017", yellow: "#f4c430", gold: "#d4af37",
  lemon: "#e8e34a", cream_yellow: "#f7e7a1",

  green: "#2e7d32", pista: "#93c572", mehendi: "#7b8b3d", olive: "#6b7a3a",
  bottle: "#0f4d3a", emerald: "#1f8a5c", mint: "#a8e6c4", parrot: "#5fb03a",
  firozi: "#00a9a5", teal: "#00796b", turquoise: "#2ec4b6", aqua: "#79d6d2",

  blue: "#1565c0", navy: "#1a2a52", royal: "#1e3f9e", sky: "#87ceeb",
  ferozi: "#00a9a5", denim: "#3b5b92", indigo: "#33427a", cobalt: "#0f52ba",

  purple: "#6a1b9a", violet: "#7a3e9d", lavender: "#c3a3d8", mauve: "#b57edc",
  brown: "#795548", coffee: "#5b3a29", chocolate: "#4a2c2a", tan: "#c4915c",
  copper: "#b87333", bronze: "#9c7a3c",
};

/** Words that shift a colour rather than name one. */
const LIGHTEN = new Set(["light", "lite", "l", "pale", "soft", "baby", "powder"]);
const DARKEN = new Set(["dark", "deep", "d", "navy", "bottle"]);

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => (amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  return "#" + [r, g, b].map(c => clamp(mix(c)).toString(16).padStart(2, "0")).join("");
}

/** "Light Green" -> ["light","green"]; "d.green" -> ["d","green"]. */
const words = (name: string) =>
  name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

export function nameToColorHex(name: string, storedHex?: string | null): string {
  // A hex somebody actually chose always wins over anything guessed here.
  const stored = storedHex?.trim();
  if (stored && /^#[0-9a-f]{6}$/i.test(stored) && stored.toUpperCase() !== "#CCCCCC") {
    return stored;
  }

  const parts = words(name || "");
  const joined = parts.join("");
  if (NAMED[joined]) return NAMED[joined];

  let base: string | undefined;
  let amount = 0;
  for (const word of parts) {
    if (NAMED[word] && !base) base = NAMED[word];
    else if (LIGHTEN.has(word)) amount += 0.34;
    else if (DARKEN.has(word)) amount -= 0.3;
  }
  // "cream white" and "white cream" should land in the same place, so a second
  // known colour blends rather than being ignored.
  if (base) {
    const second = parts.map(w => NAMED[w]).filter(Boolean).filter(h => h !== base)[0];
    if (second) base = blend(base, second);
    return amount ? shift(base, amount) : base;
  }

  // Genuinely unknown. Kept muted on purpose — a confident-looking swatch for a
  // colour nobody recognised is how "Cream" ended up purple.
  let h = 5381;
  for (let i = 0; i < (name || "").length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
  const hue = h % 360;
  return hslToHex(hue, 0.25, 0.62);
}

function blend(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const mix = (sh: number) =>
    clamp((((pa >> sh) & 255) + ((pb >> sh) & 255)) / 2).toString(16).padStart(2, "0");
  return `#${mix(16)}${mix(8)}${mix(0)}`;
}

function hslToHex(hue: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => clamp((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** A readable ink colour for text sitting on a swatch. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luma = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luma > 150 ? "#1a1a1a" : "#ffffff";
}
