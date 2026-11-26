import { DOMINIO_A_LA_VISTA } from "./compartir-look";
import { claveDeSede, SEDE_PRINCIPAL, sedePrincipal } from "./sede-elegida";

// Lo que la tienda le dice a Google y a WhatsApp sobre cada página (ADR-0696, auditoría de SEO del 2026-11-23). Lógica pura, con su
// prueba al lado: la dirección canónica de cada página y lo común de su vista previa.

/** El dominio de la tienda (ADR-0595), el mismo de la imagen de «Compartir tu look». Sale del código, no de una variable de Vercel
 *  (`lib/candados.test.ts`): una vista previa en otro dominio igual apunta a la tienda de verdad. */
export const ORIGEN_PUBLICO = `https://${DOMINIO_A_LA_VISTA}`;

/** Lo común de la vista previa de toda página: el nombre del sitio y el idioma (español del Perú). Una página que arma su `openGraph`
 *  lo repite con `conBase`: Next no mezcla el `openGraph` del layout con el de la página, lo reemplaza entero. */
export const OPEN_GRAPH_BASE = { siteName: "CAYLA", locale: "es_PE", type: "website" } as const;

export const conBase = <T extends object>(openGraph: T) => ({ ...OPEN_GRAPH_BASE, ...openGraph });

type Parametros = Record<string, string | string[] | undefined>;

/** Los parámetros que cambian QUÉ se ve en una lista del catálogo, en el orden en que van en la dirección canónica. Fuera quedan los que
 *  solo la ordenan o la filtran por color y talla (`orden`, `color`, `talla`: ADR-0512), las marcas (`utm_*`) y `volver`. */
const DEL_CONTENIDO = ["lista", "categoria", "grupo", "menu", "campana", "pagina"] as const;

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/**
 * La clave de la tienda de las direcciones canónicas: la principal (Trujillo, decisión de Felipe del 2026-11-23) si se ve en la web; si
 * no, la primera en orden. Sin tiendas leídas (la base no respondió), la principal escrita: es la que el proxy pone en la puerta.
 */
export function claveCanonica(sedes: readonly { nombre: string }[]): string {
  const principal = sedePrincipal(sedes);
  return principal ? claveDeSede(principal.nombre) : SEDE_PRINCIPAL;
}

/**
 * La dirección canónica de una página (relativa: `metadataBase` la completa con `ORIGEN_PUBLICO`). Con `sede`, va primero, como la pone
 * el proxy; luego lo que cambia el contenido, sin la lista de siempre («todo») ni la página 1. Una página fija pasa solo su ruta.
 */
export function canonicalDe(ruta: string, parametros: Parametros = {}, sede: string | null = null): string {
  const query = new URLSearchParams();
  if (sede) query.set("sede", sede);
  for (const clave of DEL_CONTENIDO) {
    const valor = primero(parametros[clave]);
    if (!valor) continue;
    if (clave === "lista" && valor === "todo") continue;
    if (clave === "pagina") {
      const n = Number.parseInt(valor, 10);
      if (Number.isFinite(n) && n > 1) query.set(clave, String(n));
      continue;
    }
    query.set(clave, valor);
  }
  const texto = query.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

/** El JSON listo para ir dentro de `<script type="application/ld+json">`: con `<` escapado, para que un texto escrito por el equipo
 *  (la descripción, el nombre de una prenda o de una tienda) nunca pueda cerrar el `<script>` y meter otra cosa en la página. */
export const comoJsonLd = (dato: unknown): string => JSON.stringify(dato).replace(/</g, "\\u003c");

/** Las tiendas dichas en una frase: «Arequipa, Lima y Trujillo». Sin tiendas leídas, «el Perú» (la frase sigue siendo verdad). */
function lasTiendas(sedes: readonly { nombre: string }[]): string {
  const nombres = sedes.map((s) => s.nombre);
  if (nombres.length === 0) return "el Perú";
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Las frases bajo el enlace de las páginas que se indexan (ADR-0696, T6): cada una dice lo suyo; antes todas heredaban la del layout. Le
 * hablan igual a cualquiera («tu tienda», nunca «bienvenida») y dicen «en CAYLA», no «de CAYLA» (no todo lo que se vende es de la marca).
 * Son textos para que Felipe los cambie: la regla es que cada página tenga la suya, no estas palabras.
 */
export const DESCRIPCIONES = {
  inicio: (sedes: readonly { nombre: string }[]) =>
    `Ropa y accesorios en CAYLA ${lasTiendas(sedes)}: mira lo nuevo, las ofertas y cuánto queda en tu tienda. Sepáralo online sin pagar.`,
  lista: (titulo: string, tienda: string | null) =>
    `${titulo} en CAYLA${tienda ? ` ${tienda}` : ""}: los modelos, sus colores y tallas, y cuánto queda. Sepáralos online sin pagar y recógelos en la tienda.`,
  looks: "Outfits listos en CAYLA: prendas que combinan, armadas por el equipo. Mira cada una y sepárala para recoger en tu tienda.",
  look: (nombre: string, frase: string | null) =>
    frase?.trim() ? `${nombre}: ${frase.trim()}` : `${nombre}: un outfit armado en CAYLA. Mira cada prenda y sepárala para recoger en tu tienda.`,
  arma: "Arma tu outfit con las prendas de CAYLA, a escala y en sus colores, y sepáralo para recoger en tu tienda.",
  privacidad: "La política de privacidad de la tienda online de CAYLA: qué datos se guardan, para qué y cómo ejercer tus derechos.",
  terminosDelClub: "Las reglas del Club CAYLA: cómo se ganan y se usan los puntos, los cupones y los beneficios de cumpleaños.",
} as const;
