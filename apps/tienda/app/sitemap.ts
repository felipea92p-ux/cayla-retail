import type { MetadataRoute } from "next";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerLooks } from "@/lib/looks-servidor";
import { entradasDelMapa } from "@/lib/mapa-del-sitio";
import { claveCanonica } from "@/lib/seo";
import { leerSedes } from "@/lib/tiendas-servidor";

// GET /sitemap.xml (ADR-0696): todas las prendas publicadas en la web (de todas las tiendas: `leerCatalogo(null)`), sus categorías, los
// looks y las páginas fijas, cada una con su dirección canónica. Las lecturas son las mismas de las páginas y se comparten entre visitas;
// si la base no responde, el mapa sale con lo que no depende de ella (`entradasDelMapa`).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sedes, catalogo, looks] = await Promise.all([leerSedes(), leerCatalogo(null), leerLooks(null)]);
  return entradasDelMapa({ prendas: catalogo?.prendas ?? null, looks: looks?.looks.map((l) => l.id) ?? null }, claveCanonica(sedes));
}
