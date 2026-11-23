import type { MetadataRoute } from "next";
import { categoriasDe, type Prenda } from "./catalogo";
import { canonicalDe, ORIGEN_PUBLICO } from "./seo";

// El mapa del sitio y las reglas para los buscadores (ADR-0696, T4 de la auditoría de SEO del 2026-11-23). La lista sale de lo mismo que
// ve la persona: las prendas publicadas en la web y sus categorías, los looks y las páginas fijas. Cada dirección es la canónica (la de la
// tienda principal), igual que la que escribe cada página. Lógica pura, con su prueba al lado.

/** Las páginas fijas que se indexan (las de la cuenta, la bolsa y entrar no: llevan `noindex`). */
export const PAGINAS_FIJAS = [
  "/tiendas",
  "/como-separar",
  "/cambios-y-devoluciones",
  "/preguntas-frecuentes",
  "/club",
  "/libro-de-reclamaciones",
  "/privacidad",
  "/terminos-del-club",
] as const;

/** Las listas del catálogo que se indexan además de «Toda la tienda» (los favoritos son de cada persona: no). */
const LISTAS = ["nuevo", "ofertas", "vendidos"] as const;

/** Una dirección lista para ir dentro del XML: Next 16 escribe `<loc>` tal cual, sin escapar, y un `&` suelto (`?sede=…&categoria=…`)
 *  deja el mapa inválido para Google. Si una versión futura de Next escapa sola, la prueba del XML (`curl …/sitemap.xml`) lo mostrará doble. */
const paraXml = (url: string) => url.replace(/&/g, "&amp;");

const completa = (ruta: string) => paraXml(`${ORIGEN_PUBLICO}${ruta}`);

/** Una foto que se puede dar a Google: una dirección completa, nunca una ruta de la tienda. */
const fotoPublica = (url: string | undefined) => (url && /^https:\/\//.test(url) ? [paraXml(url)] : undefined);

/**
 * Las entradas del mapa. `prendas` son TODAS las publicadas (no solo las que hay en la tienda principal: una prenda que solo hay en Lima
 * también tiene su ficha) y `looks`, los ids de los looks. Sin lectura de la base (`null`), solo las páginas fijas y las del catálogo que
 * no dependen de ella: un mapa corto es mejor que ninguno.
 */
export function entradasDelMapa(
  datos: { prendas: readonly Prenda[] | null; looks: readonly string[] | null },
  sede: string,
): MetadataRoute.Sitemap {
  const delCatalogo = (ruta: string, parametros: Record<string, string> = {}) => completa(canonicalDe(ruta, parametros, sede));
  const entradas: MetadataRoute.Sitemap = [
    { url: delCatalogo("/inicio"), changeFrequency: "daily", priority: 1 },
    { url: delCatalogo("/catalogo"), changeFrequency: "daily", priority: 0.9 },
    ...LISTAS.map((lista) => ({ url: delCatalogo("/catalogo", { lista }), changeFrequency: "daily" as const, priority: 0.7 })),
    { url: delCatalogo("/looks"), changeFrequency: "weekly", priority: 0.6 },
    { url: delCatalogo("/looks/arma"), changeFrequency: "monthly", priority: 0.4 },
  ];
  const prendas = datos.prendas ?? [];
  for (const c of categoriasDe(prendas)) {
    entradas.push({ url: delCatalogo("/catalogo", { categoria: c.clave }), changeFrequency: "daily", priority: 0.8 });
  }
  for (const p of prendas) {
    entradas.push({ url: delCatalogo(`/catalogo/${p.id}`), changeFrequency: "daily", priority: 0.8, images: fotoPublica(p.fotos[0]) });
  }
  for (const id of datos.looks ?? []) {
    entradas.push({ url: delCatalogo(`/looks/${id}`), changeFrequency: "weekly", priority: 0.5 });
  }
  for (const ruta of PAGINAS_FIJAS) entradas.push({ url: completa(ruta), changeFrequency: "monthly", priority: 0.3 });
  return entradas;
}

/**
 * Las reglas para los buscadores: todo se puede leer menos `/api/` y `/auth/`, que no son páginas. Lo que ya dice `noindex` (la cuenta,
 * la bolsa, los filtros) NO se bloquea aquí: si un buscador no puede entrar, nunca ve el `noindex` y podría listar la dirección igual.
 */
export const REGLAS_PARA_BUSCADORES: MetadataRoute.Robots = {
  rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] }],
  sitemap: completa("/sitemap.xml"),
};
