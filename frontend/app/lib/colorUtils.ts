// Generate a deterministic, visually-distinct hex color from a color name.
// Used both when auto-creating a color and as a display fallback when hex is the placeholder grey.
export function nameToColorHex(name: string, storedHex?: string | null): string {
  const placeholder = storedHex?.toUpperCase();
  if (storedHex && placeholder !== "#CCCCCC") return storedHex;

  // djb2 hash → hue
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
  const hue = h % 360;

  // HSL(hue, 62%, 48%) → hex
  const s = 0.62, l = 0.48;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (hue < 60)  { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
