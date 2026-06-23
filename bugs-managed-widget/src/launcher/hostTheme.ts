// Host-theme auto-detection.
//
// Goal: when a host app embeds the widget WITHOUT pinning brand colors, the orb
// and panel should adopt the host's palette and light/dark state so the widget
// reads as part of the app instead of a generic purple standout — and re-blend
// live when the host toggles its theme.
//
// We never touch the host's DOM; we only *read* it (computed styles, the
// theme-color meta, and :root design tokens) to derive a small palette. All
// detection is best-effort with safe fallbacks, so a host with no detectable
// brand still gets a tasteful, theme-correct result.

import { useEffect, useState } from 'react';

export interface HostTheme {
  mode: 'light' | 'dark';
  /** Brand/accent — orb core + primary buttons. */
  accent: string;
  /** Secondary brand color — orb ring + gradient end. Derived if only one found. */
  accentRing: string;
  /** Panel background. */
  surface: string;
  /** Sunken input background. */
  inputBg: string;
  /** Primary text on surface. */
  text: string;
  /** Hairline / divider. */
  border: string;
}

type RGBA = [number, number, number, number];

// ── color utils ──────────────────────────────────────────────────────────────
function parseRgb(str: string): RGBA | null {
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

// Resolve any CSS color string (hex, hsl, named, var-resolved) to rgba by
// letting the browser normalize it through a throwaway element.
function resolveColor(value: string | undefined | null): RGBA | null {
  if (!value || typeof document === 'undefined') return null;
  const v = value.trim();
  if (!v || v === 'transparent' || v === 'currentColor' || v === 'inherit') return null;
  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = v; // invalid values leave it empty
  if (!probe.style.color) return null;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return parseRgb(resolved);
}

function luminance([r, g, b]: RGBA): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rgbToHsl([r, g, b]: RGBA): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function toHex([r, g, b]: RGBA): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

// Greys, near-black, near-white, and transparent are not brand colors.
function isNeutral(c: RGBA): boolean {
  if (c[3] < 0.35) return true;
  const [, s, l] = rgbToHsl(c);
  if (s < 0.18) return true; // grey scale
  if (l > 0.93 || l < 0.07) return true; // washed-out / near-black tints
  return false;
}

function shiftLightness(hex: string, delta: number): string {
  const c = resolveColor(hex);
  if (!c) return hex;
  const [h, s, l] = rgbToHsl(c);
  return hslToHex(h, s, Math.max(0, Math.min(1, l + delta)));
}

function hueDistance(a: string, b: string): number {
  const ca = resolveColor(a);
  const cb = resolveColor(b);
  if (!ca || !cb) return 0;
  const d = Math.abs(rgbToHsl(ca)[0] - rgbToHsl(cb)[0]);
  return Math.min(d, 360 - d);
}

// ── detection ────────────────────────────────────────────────────────────────
const ACCENT_SELECTORS =
  'button,a,[role="button"],[class*="primary"],[class*="accent"],[class*="brand"],' +
  '[class*="btn"],header,nav,[class*="navbar"],[class*="sidebar"]';

const TOKEN_HINT = /(primary|accent|brand|gold|navy|blue|green|teal|indigo|violet|orange|red|color)/i;

function collectAccentCandidates(): Map<string, number> {
  const tally = new Map<string, number>();
  const add = (c: RGBA | null, weight: number) => {
    if (!c || isNeutral(c)) return;
    const hex = toHex(c);
    tally.set(hex, (tally.get(hex) ?? 0) + weight);
  };

  // 1) theme-color meta — the host's declared brand color, when present.
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  add(resolveColor(meta?.content), 6);

  // 2) :root design tokens (custom properties). getComputedStyle exposes
  //    declared custom props in modern engines; hint-filter to brand-ish names.
  try {
    const cs = getComputedStyle(document.documentElement);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (prop.startsWith('--') && TOKEN_HINT.test(prop)) {
        add(resolveColor(cs.getPropertyValue(prop)), 3);
      }
    }
  } catch {
    /* ignore */
  }

  // 3) sampled prominent elements — bg fills weighted over text/border.
  const els = Array.from(document.querySelectorAll(ACCENT_SELECTORS)).slice(0, 240);
  for (const el of els) {
    const s = getComputedStyle(el as Element);
    add(parseRgb(s.backgroundColor), 2);
    add(parseRgb(s.borderTopColor), 1);
    add(parseRgb(s.color), 1);
  }
  return tally;
}

function pickAccents(tally: Map<string, number>): { accent: string; ring: string } | null {
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const accent = ranked[0][0];
  // Ring = the strongest *distinct-hue* second brand color (e.g. gold next to
  // navy); if none, derive a sibling by nudging lightness.
  const second = ranked.slice(1).find(([hex]) => hueDistance(hex, accent) > 35);
  const ring = second ? second[0] : shiftLightness(accent, 0.16);
  return { accent, ring };
}

function detectMode(): 'light' | 'dark' {
  // 1) explicit theme markers the host sets on <html>/<body>.
  for (const el of [document.documentElement, document.body].filter(Boolean)) {
    const hay = `${el.className} ${el.getAttribute('data-theme') ?? ''} ${
      el.getAttribute('data-bs-theme') ?? ''
    } ${el.getAttribute('data-color-mode') ?? ''} ${el.getAttribute('data-mode') ?? ''}`.toLowerCase();
    if (/\bdark\b/.test(hay)) return 'dark';
    if (/\blight\b/.test(hay)) return 'light';
  }
  // 2) first opaque background we can walk to.
  let node: HTMLElement | null = document.body;
  while (node) {
    const bg = parseRgb(getComputedStyle(node).backgroundColor);
    if (bg && bg[3] > 0.5) return luminance(bg) < 0.5 ? 'dark' : 'light';
    node = node.parentElement;
  }
  // 3) text color is always solid — dark text ⇒ light app (and vice-versa).
  const text = resolveColor(getComputedStyle(document.body || document.documentElement).color);
  if (text) return luminance(text) < 0.5 ? 'light' : 'dark';
  // 4) OS preference.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function detectSolidBg(): RGBA | null {
  let node: HTMLElement | null = document.body;
  while (node) {
    const bg = parseRgb(getComputedStyle(node).backgroundColor);
    if (bg && bg[3] > 0.5) return bg;
    node = node.parentElement;
  }
  return null;
}

export function detectHostTheme(): HostTheme {
  if (typeof document === 'undefined') {
    return {
      mode: 'dark',
      accent: '#6366f1',
      accentRing: '#8b5cf6',
      surface: '#1a1a2e',
      inputBg: '#16213e',
      text: '#e0e0e0',
      border: '#33384f',
    };
  }

  const mode = detectMode();
  const accents = pickAccents(collectAccentCandidates());
  const accent = accents?.accent ?? (mode === 'dark' ? '#6366f1' : '#4f46e5');
  const accentRing = accents?.ring ?? shiftLightness(accent, mode === 'dark' ? 0.16 : -0.12);

  // Panel surface/text follow the host's real bg/text when they're solid, so
  // the modal feels native; otherwise fall back to clean mode presets (handles
  // gradient/transparent body backgrounds like Factoring's cream wash).
  const solidBg = detectSolidBg();
  const bodyText = resolveColor(
    getComputedStyle(document.body || document.documentElement).color,
  );

  const surface = solidBg ? toHex(solidBg) : mode === 'dark' ? '#1a1a2e' : '#ffffff';
  const text = bodyText ? toHex(bodyText) : mode === 'dark' ? '#e6e6ea' : '#1f2430';
  const inputBg = shiftLightness(surface, mode === 'dark' ? 0.06 : -0.04);
  const border = shiftLightness(surface, mode === 'dark' ? 0.12 : -0.1);

  return { mode, accent, accentRing, surface, inputBg, text, border };
}

// React hook: detect once, then re-detect when the host swaps theme. `enabled`
// is false when the host pinned explicit colors, so we don't override them.
export function useHostTheme(enabled: boolean): HostTheme {
  const [theme, setTheme] = useState<HostTheme>(detectHostTheme);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      // Defer to next frame so we read styles after the host's class/attr swap
      // has actually applied.
      raf = requestAnimationFrame(() => setTheme(detectHostTheme()));
    };

    const mo = new MutationObserver(update);
    const attrFilter = ['class', 'style', 'data-theme', 'data-bs-theme', 'data-color-mode', 'data-mode'];
    mo.observe(document.documentElement, { attributes: true, attributeFilter: attrFilter });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: attrFilter });

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', update);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      mq?.removeEventListener('change', update);
    };
  }, [enabled]);

  return theme;
}
