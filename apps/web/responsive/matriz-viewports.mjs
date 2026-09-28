// Matriz centralizada de viewports del Responsive Quality Gate — ver `responsive/README.md`.
//
// Una sola fuente de verdad para "qué anchos de celular/tablet probamos". Ninguna pantalla
// duplica esta lista: la usa entera, un subconjunto por id, o la entera menos exclusiones —
// ver `resolverViewports` más abajo y `elegirViewports` en `pantallas/registro.mjs`.

/** @typedef {{ id: string, w: number, h: number }} Viewport */

/** @type {Viewport[]} */
export const MATRIZ_VIEWPORTS = [
  { id: "320x568", w: 320, h: 568 },
  { id: "320x648", w: 320, h: 648 },
  { id: "360x640", w: 360, h: 640 },
  { id: "360x780", w: 360, h: 780 },
  { id: "360x800", w: 360, h: 800 },
  { id: "360x820", w: 360, h: 820 },
  { id: "375x667", w: 375, h: 667 },
  { id: "375x812", w: 375, h: 812 },
  { id: "390x844", w: 390, h: 844 },
  { id: "393x852", w: 393, h: 852 },
  { id: "393x873", w: 393, h: 873 },
  { id: "410x914", w: 410, h: 914 },
  { id: "412x891", w: 412, h: 891 },
  { id: "412x915", w: 412, h: 915 },
  { id: "412x923", w: 412, h: 923 },
  { id: "414x896", w: 414, h: 896 },
  { id: "430x932", w: 430, h: 932 },
  { id: "440x956", w: 440, h: 956 },
  { id: "444x980", w: 444, h: 980 },
  { id: "448x998", w: 448, h: 998 },
];

// Subconjunto corto para pantallas que solo declaran `viewports: "rapida"` (sanity check en 4
// anchos representativos — el más angosto, dos intermedios típicos de iPhone y el más ancho —
// en vez de los 20). Pensado para pantallas de escritorio (Caja, Almacén) donde el responsive
// móvil no es la regla del repo (CLAUDE.md, «Celular obligatorio») pero igual no debería romperse.
const IDS_MATRIZ_RAPIDA = ["320x568", "375x812", "412x915", "430x932"];

const POR_ID = new Map(MATRIZ_VIEWPORTS.map((v) => [v.id, v]));

/**
 * Resuelve qué viewports usa una pantalla a partir de su config (`pantalla.viewports`):
 *  - `undefined` o `"matriz"` → la matriz completa (20).
 *  - `"rapida"` → el subconjunto corto (4).
 *  - `string[]` → esos ids de la matriz, en ese orden (error si alguno no existe).
 *  - `{ excluir: string[] }` → la matriz completa menos esos ids.
 *  - `{ extra: Viewport[] }` → la matriz completa más viewports ad-hoc propios de la pantalla
 *    (por ejemplo un ancho de kiosko de caja que ninguna otra pantalla necesita).
 *  - `{ solo: string[], extra: Viewport[] }` → combina ambas.
 * @param {unknown} config
 * @returns {Viewport[]}
 */
export function resolverViewports(config) {
  if (config === undefined || config === "matriz") return MATRIZ_VIEWPORTS;
  if (config === "rapida") return IDS_MATRIZ_RAPIDA.map(idComoViewport);
  if (Array.isArray(config)) return config.map(idComoViewport);
  if (config && typeof config === "object") {
    let base = config.solo ? config.solo.map(idComoViewport) : MATRIZ_VIEWPORTS;
    if (config.excluir) {
      const fuera = new Set(config.excluir);
      base = base.filter((v) => !fuera.has(v.id));
    }
    if (config.extra) base = [...base, ...config.extra];
    return base;
  }
  throw new Error(`responsive: config de viewports no reconocida: ${JSON.stringify(config)}`);
}

function idComoViewport(id) {
  if (typeof id === "object" && id.w && id.h) return id; // ya es un Viewport ad-hoc
  const v = POR_ID.get(id);
  if (!v) throw new Error(`responsive: viewport "${id}" no está en MATRIZ_VIEWPORTS (revisa matriz-viewports.mjs)`);
  return v;
}
