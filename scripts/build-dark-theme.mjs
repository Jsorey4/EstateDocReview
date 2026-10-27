// Generate dark-theme color overrides for every component in src/styles.css,
// preserving layout and media queries. Colors are remapped in OKLCH by role
// (surface, text, border, shadow) so hue and hierarchy survive the inversion.
// Run: node scripts/build-dark-theme.mjs
import fs from "node:fs/promises";
import postcss from "postcss";

// Components that are already dark in the light theme keep their colors.
const KEEP =
  /\.welcome-|\.light-dot|\.orbit|\.art-|\.toast|\.skip-link|::backdrop|\.sidebar-scrim|\.button\.primary|\.button\.danger/;

const BRAND_HUE = 160;

function toOklch(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const alpha = h.length === 8 ? h.slice(6) : "";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = C < 0.002 ? BRAND_HUE : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { L, C, H, alpha };
}

function fromOklch(L, C, H) {
  const rgb = (c) => {
    const a = c * Math.cos((H * Math.PI) / 180);
    const b = c * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  };
  // Reduce chroma until the color fits in sRGB.
  let lin = rgb(C);
  for (let c = C; lin.some((v) => v < -1e-4 || v > 1 + 1e-4) && c > 0; c -= 0.002) lin = rgb(c);
  return lin
    .map((v) => {
      const c = Math.max(0, Math.min(1, v));
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(s * 255).toString(16).padStart(2, "0");
    })
    .join("");
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function remap(hex, prop) {
  const { L, C, alpha } = toOklch(hex);
  let { H } = toOklch(hex);
  let Ld = L;
  let Cd = C;
  if (/shadow/.test(prop)) {
    const a = alpha ? parseInt(alpha, 16) / 255 : 0.25;
    return "#000000" + Math.round(clamp(a * 2.2, 0.18, 0.6) * 255).toString(16).padStart(2, "0");
  }
  if (/^(color|fill|stroke|caret-color|accent-color|text-decoration-color)$/.test(prop)) {
    if (L >= 0.75) return hex; // Light text sits on a dark or saturated fill.
    Ld = clamp(0.965 - (L - 0.3), 0.74, 0.94);
    Cd = Math.min(C * 1.15, 0.13);
    if (Ld > 0.88) Cd = Math.min(Cd, 0.018);
  } else if (/border|outline|column-rule/.test(prop)) {
    if (L >= 0.8) {
      Ld = 0.3 + (1 - L) * 0.55;
      Cd = Math.min(C * 1.2, 0.05);
    } else {
      Ld = clamp(0.6 + (0.6 - L) * 0.2, 0.55, 0.7);
      Cd = Math.min(C, 0.1);
    }
  } else {
    // Surfaces: white cards sit above a darker page; tinted fills rise above cards.
    if (C < 0.02) H = BRAND_HUE; // Neutral surfaces share one cool green cast.
    if (L >= 0.9) {
      const d = 1 - L;
      if (d <= 0.025) {
        Ld = 0.232 - d * 1.9;
        Cd = 0.012;
      } else {
        Ld = 0.245 + (d - 0.025) * 0.55;
        Cd = Math.min(C * 1.3 + 0.006, 0.055);
      }
    } else if (L >= 0.5) {
      Ld = L * 0.55 + 0.04;
      Cd = Math.min(C, 0.11);
    }
  }
  return "#" + fromOklch(Ld, Cd, H) + alpha;
}

const root = postcss.parse(await fs.readFile("src/styles.css", "utf8"));
const output = postcss.root();
function visit(container, dest) {
  for (const node of container.nodes ?? []) {
    if (node.type === "atrule") {
      if (node.name === "media" && !node.params.includes("print")) {
        const next = postcss.atRule({ name: node.name, params: node.params });
        visit(node, next);
        if (next.nodes?.length) dest.append(next);
      }
    } else if (node.type === "rule") {
      const selectors = node.selectors.filter((s) => !KEEP.test(s));
      if (!selectors.length) continue;
      const rule = postcss.rule({
        selector: selectors
          .map((s) => (s.trim() === ":root" ? 'html[data-theme="dark"]' : 'html[data-theme="dark"] ' + s))
          .join(",\n"),
      });
      for (const d of node.nodes ?? []) {
        if (d.type !== "decl" || d.prop.startsWith("--")) continue;
        if (!/#[\da-f]{3,8}\b|\b(white|black)\b/i.test(d.value)) continue;
        const value = d.value
          .replace(/\bwhite\b/g, "#ffffff")
          .replace(/\bblack\b/g, "#000000")
          // A zero-blur box-shadow ring is drawn like a border.
          .replace(/#[\da-f]{3,8}\b/gi, (h) =>
            remap(h, /shadow/.test(d.prop) && /^0 0 0 /.test(d.value) ? "outline" : d.prop),
          );
        rule.append(d.clone({ value }));
      }
      if (rule.nodes?.length) dest.append(rule);
    }
  }
}
visit(root, output);

const overrides = await fs.readFile("scripts/dark-overrides.css", "utf8");
await fs.writeFile(
  "src/dark.css",
  "/* Generated by scripts/build-dark-theme.mjs from styles.css and dark-overrides.css. Do not edit by hand. Screen-only: print stays light. */\n@media screen {\n" +
    output.toString() +
    "\n" +
    overrides +
    "}\n",
);
