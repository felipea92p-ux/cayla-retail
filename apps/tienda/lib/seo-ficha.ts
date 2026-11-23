import { claveCategoria, soles } from "./catalogo";
import { nivelAqui, type Ficha } from "./ficha";
import { canonicalDe, ORIGEN_PUBLICO } from "./seo";

// Lo que la ficha de una prenda le dice a Google y a WhatsApp (ADR-0696, T3 de la auditoría de SEO del 2026-11-23): la frase bajo el
// enlace y los datos de producto (`Product` con su `Offer`, de schema.org) con el precio en soles y cuánto hay en la tienda. Lógica pura,
// con su prueba al lado. Decisiones de Felipe del 2026-11-23: sin `brand` (no todo lo que se vende es CAYLA) y sin precio en la imagen
// de WhatsApp (el precio cambia por tienda y por campaña; aquí va en el texto, que se arma en cada visita).

/** Cuántas letras caben bajo un enlace de Google antes de que lo corte. */
const LARGO_DESCRIPCION = 155;

/** La tienda de la página: su nombre web («Trujillo») y su dirección, si se ve en la web. */
export type TiendaDeLaFicha = { nombre: string; direccion?: string | null };

/** Un texto de una sola línea y sin espacios de más, cortado en la última palabra entera antes del tope, con «…». */
function recortar(texto: string, tope = LARGO_DESCRIPCION): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= tope) return limpio;
  const corte = limpio.slice(0, tope - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > tope * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:—-]+$/, "")}…`;
}

/** Lo que cuesta en la tienda de la página: «S/ 79.90», o «desde S/ 63.90» si no todas sus tallas y colores cuestan lo mismo. */
function precioEnTexto(f: Ficha): string {
  return `${f.desde ? "desde " : ""}${soles(f.precioFinal)}`;
}

/**
 * La frase bajo el enlace (Google) y en la vista previa (WhatsApp): la descripción de la prenda si la tiene; si no, una armada con lo que
 * hay. Dice «en CAYLA» (la tienda), nunca «de CAYLA» (D3: no todo es de la marca).
 */
export function descripcionDeFicha(f: Ficha, tienda: TiendaDeLaFicha | null): string {
  if (f.descripcion?.trim()) return recortar(f.descripcion);
  const donde = tienda ? `en CAYLA ${tienda.nombre}` : "en CAYLA";
  return recortar(`${f.nombre} a ${precioEnTexto(f)} ${donde}. Sepárala online sin pagar y recógela en la tienda.`);
}

const SCHEMA = "https://schema.org/";

/** Cuánto hay del modelo (todas sus tallas y colores) en la tienda de la página, dicho como lo entiende Google. */
export function disponibilidad(f: Ficha): string {
  const niveles = f.variantes.map((v) => nivelAqui(v, f.sede));
  if (niveles.some((n) => n === "hay")) return `${SCHEMA}InStock`;
  if (niveles.some((n) => typeof n === "number" && n > 0)) return `${SCHEMA}LimitedAvailability`;
  return `${SCHEMA}OutOfStock`;
}

/** Un monto como lo pide schema.org: con punto y dos decimales («79.90»), sin «S/». */
const monto = (n: number) => n.toFixed(2);

/**
 * Los datos de producto de la ficha (`application/ld+json`): el `Product` con su oferta en la tienda de la página y la ruta (Inicio ›
 * Categoría › Prenda). `sede` es la clave de la tienda de la página (`?sede=`); las direcciones son las canónicas de esa tienda.
 */
export function jsonLdDeFicha(f: Ficha, tienda: TiendaDeLaFicha | null, sede: string | null): Record<string, unknown> {
  const url = `${ORIGEN_PUBLICO}${canonicalDe(`/catalogo/${f.id}`, {}, sede)}`;
  const precios = f.variantes.map((v) => v.precioFinal);
  const menor = precios.length > 0 ? Math.min(...precios) : f.precioFinal;
  const mayor = precios.length > 0 ? Math.max(...precios) : f.precioFinal;
  const conCampana = f.campana !== null && f.precioFinal < f.precio;
  const comun = {
    priceCurrency: "PEN",
    availability: disponibilidad(f),
    itemCondition: `${SCHEMA}NewCondition`,
    // Se separa en la web y se recoge (y se paga) en la tienda: no hay envío.
    availableDeliveryMethod: `${SCHEMA}OnSitePickup`,
    url,
    seller: { "@type": "Organization", name: "CAYLA" },
    ...(tienda
      ? { availableAtOrFrom: { "@type": "Place", name: `CAYLA ${tienda.nombre}`, ...(tienda.direccion ? { address: tienda.direccion } : {}) } }
      : {}),
    ...(conCampana && f.campana?.hasta ? { priceValidUntil: f.campana.hasta } : {}),
  };
  const oferta =
    menor === mayor
      ? { "@type": "Offer", price: monto(menor), ...comun }
      : { "@type": "AggregateOffer", lowPrice: monto(menor), highPrice: monto(mayor), offerCount: precios.length, ...comun };

  const clave = claveCategoria(f.categoria);
  const ruta = [
    { nombre: "Inicio", url: `${ORIGEN_PUBLICO}${canonicalDe("/inicio", {}, sede)}` },
    ...(f.categoria && clave ? [{ nombre: f.categoria.nombre, url: `${ORIGEN_PUBLICO}${canonicalDe("/catalogo", { categoria: clave }, sede)}` }] : []),
    { nombre: f.nombre, url },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#prenda`,
        name: f.nombre,
        ...(f.descripcion?.trim() ? { description: f.descripcion.replace(/\s+/g, " ").trim() } : {}),
        ...(f.fotos.length > 0 ? { image: f.fotos.map((x) => x.url) } : {}),
        ...(f.codigo ? { sku: f.codigo } : {}),
        ...(f.categoria ? { category: f.categoria.nombre } : {}),
        offers: oferta,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: ruta.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.nombre, item: r.url })),
      },
    ],
  };
}
