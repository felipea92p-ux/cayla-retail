import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de los alias de `next.config.ts`: un alias (`redirects()`) corre ANTES que cualquier página, así que si su origen es una ruta
// que sí tiene `page.tsx`, esa página es inalcanzable. Pasó el 2026-11-13: ADR-0655 sacó «Campañas y ofertas» de Insignias a su propia
// ruta `/productos/campanas`, pero el alias del 2026-10-22 que la mandaba a `/productos/insignias` siguió vivo: la fila del menú abría
// Insignias, y quien solo tenía el módulo Campañas caía en un bucle de redirecciones (la página de Insignias lo devolvía a Campañas).
// Nadie lo vio porque ni el build ni el tipado se quejan de un alias que tapa una página.
//
// Contrato (3 líneas). PROMETE: que ningún alias incondicional de `next.config.ts` tenga como origen una ruta con `page.tsx` bajo `app/`.
// ASUME: los alias se escriben como `{ source: "/ruta/fija", … }` en una sola línea y las rutas son carpetas con `page.tsx`. NO PROMETE:
// que un alias con `has:` (solo ante cierto `?query`) o con parámetros (`:resto*`) esté bien; esos pueden convivir con la página a propósito.

const raiz = new URL("../", import.meta.url);

/** Rutas reales de la app: `app/(app)/productos/campanas/page.tsx` → `/productos/campanas` (sin grupos `(x)` ni ranuras `@x`). */
function rutasConPagina(): Set<string> {
  const dir = new URL("app/", raiz);
  const rutas = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => /(^|\/)page\.tsx$/.test(f))
    .map((f) => {
      const tramos = f.split("/").slice(0, -1).filter((t) => !/^\([^)]*\)$/.test(t) && !t.startsWith("@"));
      return `/${tramos.join("/")}`;
    });
  return new Set(rutas);
}

/** Los alias sin condición (`has`) y sin parámetros, de la config. */
function aliasFijos(): { source: string; linea: string }[] {
  const fuente = readFileSync(new URL("next.config.ts", raiz), "utf8");
  return fuente
    .split("\n")
    .map((linea) => ({ linea: linea.trim(), m: linea.match(/\{\s*source:\s*"([^"]+)"/) }))
    .filter(({ linea, m }) => m && !linea.startsWith("//") && !linea.includes("has:") && !/[:*(]/.test(m[1]))
    .map(({ linea, m }) => ({ source: (m as RegExpMatchArray)[1], linea }));
}

describe("un alias de next.config.ts no tapa una página que existe", () => {
  const paginas = rutasConPagina();
  const alias = aliasFijos();

  it("encuentra las páginas y los alias (no mira una carpeta vacía)", () => {
    expect(paginas.has("/productos/campanas")).toBe(true);
    expect(paginas.has("/productos/insignias")).toBe(true);
    expect(alias.map((a) => a.source)).toContain("/productos/etiquetas");
  });

  it.each(alias.map((a) => [a.source] as const))("%s no es una ruta con página propia", (source) => {
    expect(paginas.has(source), `${source} tiene page.tsx: quita su alias de next.config.ts o borra la página`).toBe(false);
  });
});
