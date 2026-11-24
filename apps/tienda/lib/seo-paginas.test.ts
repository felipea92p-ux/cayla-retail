import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGINAS_FIJAS } from "./mapa-del-sitio";

// El registro de lo que cada página le dice a Google (ADR-0696, T6 de la auditoría de SEO del 2026-11-23). Toda `page.tsx` de la tienda
// está aquí: `indexa` (tiene su frase y su dirección canónica, y las fijas van en el mapa del sitio) o `no` (lleva `noindex`, con el
// motivo). Esta prueba abre cada archivo y lo comprueba, y falla si una página nueva nace sin declararse: antes, casi todas heredaban la
// frase del layout y nadie lo notaba. El registro vive aquí y no en `lib/`: ninguna pantalla lo lee.

type SeoDeLaPagina = { indexa: true } | { indexa: false; motivo: string } | { redirige: string };

/** El tablero de las páginas, como `guia-de-foco-pantallas.ts` en el ERP. Una página nueva se declara aquí. */
const SEO_DE_LAS_PAGINAS: Record<string, SeoDeLaPagina> = {
  "/": { redirige: "el proxy la manda al Inicio con su tienda; la página es la red por si no" },
  "/inicio": { indexa: true },
  "/catalogo": { indexa: true },
  "/catalogo/[id]": { indexa: true },
  "/looks": { indexa: true },
  "/looks/[id]": { indexa: true },
  "/looks/arma": { indexa: true },
  "/tiendas": { indexa: true },
  "/como-separar": { indexa: true },
  "/cambios-y-devoluciones": { indexa: true },
  "/preguntas-frecuentes": { indexa: true },
  "/club": { indexa: true },
  "/libro-de-reclamaciones": { indexa: true },
  "/privacidad": { indexa: true },
  "/terminos-del-club": { indexa: true },
  "/nuestra-historia": { indexa: true },
  "/trabaja-con-nosotros": { indexa: true },
  "/looks/guardado/[id]": { indexa: false, motivo: "el look guardado de UNA persona" },
  "/tu-look": { indexa: false, motivo: "un look compartido por WhatsApp: uno por cada combinación posible" },
  "/bolsa": { indexa: false, motivo: "la bolsa de cada persona" },
  "/bolsa/separado/[numero]": { indexa: false, motivo: "la confirmación de un pedido" },
  "/entrar": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/crear-cuenta": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/olvide-mi-contrasena": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/nueva-contrasena": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/restablecer-acceso": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/cuenta": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/club": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/correo": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/eliminar": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/pedidos": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/pedidos/[numero]": { indexa: false, motivo: "la cuenta de cada persona" },
  "/notificaciones": { indexa: false, motivo: "los avisos de cada persona" },
  "/recomendaciones": { indexa: false, motivo: "se escriben con el nombre de cada persona" },
  "/libro-de-reclamaciones/hoja/[id]": { indexa: false, motivo: "la hoja de reclamación de una persona" },
  "/vista-previa/[llave]": { indexa: false, motivo: "una vista previa interna del ERP, con llave" },
};

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
    expect(enDisco.filter((r) => !registradas.includes(r)), "páginas sin declarar en el registro de esta prueba").toEqual([]);
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
