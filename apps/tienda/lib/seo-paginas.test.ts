import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGINAS_FIJAS } from "./mapa-del-sitio";
import { SEO_DE_LAS_PAGINAS } from "./seo-paginas";

const APP = path.join(__dirname, "..", "app");

/** Cada `page.tsx` de la tienda con su ruta (sin los grupos entre paréntesis): `app/(catalogo)/catalogo/[id]/page.tsx` → `/catalogo/[id]`. */
function paginas(dir = APP): { ruta: string; archivo: string }[] {
  return readdirSync(dir).flatMap((nombre) => {
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) return paginas(completo);
    if (nombre !== "page.tsx") return [];
    const partes = path.relative(APP, dir).split(path.sep).filter((p) => p && !/^\(.*\)$/.test(p));
    return [{ ruta: `/${partes.join("/")}`, archivo: completo }];
  });
}

const TODAS = paginas();

describe("lo que cada página le dice a Google (ADR-0696)", () => {
  it("toda página está en el registro, y el registro no tiene páginas que ya no existen", () => {
    const enDisco = TODAS.map((p) => p.ruta).sort();
    const registradas = Object.keys(SEO_DE_LAS_PAGINAS).sort();
    expect(enDisco.filter((r) => !registradas.includes(r)), "páginas sin declarar en lib/seo-paginas.ts").toEqual([]);
    expect(registradas.filter((r) => !enDisco.includes(r)), "páginas del registro que ya no existen").toEqual([]);
  });

  // Una página que se indexa puede llevar un noindex que depende de lo pedido (los filtros de color y talla, los favoritos, una ficha que la
  // base no pudo leer): eso lo decide su `generateMetadata`, no este registro.
  it("la que se indexa tiene su propia frase y su dirección canónica", () => {
    for (const { ruta, archivo } of TODAS) {
      const seo = SEO_DE_LAS_PAGINAS[ruta];
      if (!seo || !("indexa" in seo) || !seo.indexa) continue;
      const texto = readFileSync(archivo, "utf8");
      expect(texto, `${ruta}: le falta su frase (description)`).toMatch(/\bdescription\s*:/);
      expect(texto, `${ruta}: le falta su dirección canónica`).toMatch(/alternates:\s*\{\s*canonical\b/);
    }
  });

  it("la que no se indexa lo dice con noindex, y su motivo no está vacío", () => {
    for (const { ruta, archivo } of TODAS) {
      const seo = SEO_DE_LAS_PAGINAS[ruta];
      if (!seo || !("indexa" in seo) || seo.indexa) continue;
      expect(seo.motivo.trim().length, ruta).toBeGreaterThan(10);
      expect(readFileSync(archivo, "utf8"), `${ruta}: le falta robots: { index: false … }`).toMatch(/robots:\s*\{\s*index:\s*false/);
    }
  });

  it("toda página fija que se indexa está en el mapa del sitio, y el mapa no lleva ninguna que no se indexe", () => {
    const fijas = TODAS.filter(({ ruta }) => {
      const seo = SEO_DE_LAS_PAGINAS[ruta];
      return seo && "indexa" in seo && seo.indexa && !ruta.includes("[") && !/^\/(inicio|catalogo|looks)(\/|$)/.test(ruta);
    }).map((p) => p.ruta);
    expect([...PAGINAS_FIJAS].sort()).toEqual(fijas.sort());
  });
});
