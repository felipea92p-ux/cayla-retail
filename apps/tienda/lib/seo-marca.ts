import type { SemanaDeTienda } from "@cayla-retail/shared/horario-de-tienda";
import { REDES } from "./redes";
import { claveDeSede } from "./sede-elegida";
import { canonicalDe, ORIGEN_PUBLICO } from "./seo";

// La marca y sus tiendas para Google (ADR-0696, T5 de la auditoría de SEO del 2026-11-23): quién es CAYLA (`Organization`, con su logo
// y sus redes) y dónde están sus tiendas (`ClothingStore`, con su dirección, su WhatsApp y su horario), para las búsquedas de la ciudad
// («tienda de ropa en Trujillo»). Sale de lo mismo que ya se ve en el Inicio y en «Nuestras tiendas». Lógica pura, con su prueba al lado.

const MARCA_ID = `${ORIGEN_PUBLICO}/#marca`;

/** El logo para Google: el colibrí oficial de la app (512 px, cuadrado, sobre crema), tal cual; no se dibuja otro. */
const LOGO = `${ORIGEN_PUBLICO}/cayla-app-512.png`;

/** Quién es CAYLA y su sitio, para el Inicio. Las redes salen de `lib/redes.ts`, las mismas del pie de cada página. */
export function jsonLdDeLaMarca(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": MARCA_ID, name: "CAYLA", url: ORIGEN_PUBLICO, logo: LOGO, sameAs: REDES.map((r) => r.url) },
      { "@type": "WebSite", "@id": `${ORIGEN_PUBLICO}/#sitio`, name: "CAYLA", url: ORIGEN_PUBLICO, inLanguage: "es-PE", publisher: { "@id": MARCA_ID } },
    ],
  };
}

/** Una tienda como la lee la página «Nuestras tiendas» (`lib/tiendas.ts`). */
export type TiendaParaGoogle = {
  nombre: string;
  direccion: string;
  whatsapp: string;
  mapa: string | null;
  foto: string | null;
  dias: SemanaDeTienda;
};

const DIAS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Minutos desde la medianoche → «HH:MM». La medianoche del cierre (1440) se escribe «23:59»: schema.org no acepta «24:00». */
function hora(minutos: number): string {
  const m = Math.min(minutos, 24 * 60 - 1);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** El horario de la semana: los días que abren a la misma hora van juntos, en el orden de la semana. Sin horas, ninguno. */
export function horarioParaGoogle(dias: SemanaDeTienda): Record<string, unknown>[] {
  const grupos = new Map<string, { abre: number; cierra: number; dias: string[] }>();
  dias.forEach((tramo, i) => {
    if (!tramo || !DIAS[i]) return;
    const clave = `${tramo.abre}-${tramo.cierra}`;
    const grupo = grupos.get(clave) ?? { abre: tramo.abre, cierra: tramo.cierra, dias: [] };
    grupo.dias.push(DIAS[i]);
    grupos.set(clave, grupo);
  });
  return [...grupos.values()].map((g) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: g.dias, opens: hora(g.abre), closes: hora(g.cierra) }));
}

/** Las tiendas para «Nuestras tiendas»: una `ClothingStore` por tienda que se ve en la web, con su página (el Inicio de esa tienda). */
export function jsonLdDeTiendas(tiendas: readonly TiendaParaGoogle[]): Record<string, unknown> | null {
  if (tiendas.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@graph": tiendas.map((t) => {
      const horario = horarioParaGoogle(t.dias);
      return {
        "@type": "ClothingStore",
        "@id": `${ORIGEN_PUBLICO}/tiendas#${claveDeSede(t.nombre)}`,
        name: `CAYLA ${t.nombre}`,
        url: `${ORIGEN_PUBLICO}${canonicalDe("/inicio", {}, claveDeSede(t.nombre))}`,
        address: { "@type": "PostalAddress", streetAddress: t.direccion, addressCountry: "PE" },
        telephone: `+51${t.whatsapp}`,
        parentOrganization: { "@type": "Organization", "@id": MARCA_ID, name: "CAYLA" },
        ...(t.mapa ? { hasMap: t.mapa } : {}),
        ...(t.foto && /^https:\/\//.test(t.foto) ? { image: t.foto } : {}),
        ...(horario.length > 0 ? { openingHoursSpecification: horario } : {}),
      };
    }),
  };
}
