// Tienda web ▸ Tráfico (ADR-0495): lo puro de la medición de visitas — de dónde llegó la persona, de qué departamento, qué acepta la
// ruta `POST /api/visita` y cuándo empieza una visita nueva. Nada aquí es un dato personal: el visitante es un número al azar de su
// cookie, el departamento sale de la ubicación aproximada que Vercel le da a la IP (la IP nunca se guarda) y el camino es la página o la
// marca del enlace por donde llegó. Lógica pura, con su prueba al lado.

export const CAMINOS = ["instagram", "directo", "whatsapp", "tiktok", "google", "qr", "otros"] as const;
export type Camino = (typeof CAMINOS)[number];

/** La cookie del visitante: un número al azar, del servidor (`httpOnly`), que se renueva con cada visita. */
export const COOKIE_VISITANTE = "tienda-visitante";
export const DIAS_VISITANTE = 90;
/** Una visita dura mientras la persona vuelve a tocar algo antes de 30 minutos (como «Mi cuenta», ADR-0408 act. 12). */
export const MINUTOS_DE_UNA_VISITA = 30;
/** Lo más que acepta la ruta: 20 pasos y 4 KB por envío (la base tampoco anota más de 20). */
export const TOPE_DE_PASOS = 20;
export const TOPE_DEL_ENVIO = 4096;

// La marca de un enlace (`?utm_source=…`): la ponen los QR impresos y los enlaces que la tienda comparte, y gana a la página de origen.
const MARCAS: Readonly<Record<string, Camino>> = {
  instagram: "instagram",
  ig: "instagram",
  tiktok: "tiktok",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  google: "google",
  qr: "qr",
};

/**
 * Por dónde llegó la persona: la marca del enlace si la trae; si no, la página de donde vino (`document.referrer`). Sin página de origen,
 * o desde la misma tienda, es «Directo» (escribió la dirección, la tenía guardada, o la app no dice de dónde viene: WhatsApp suele no
 * decirlo, por eso sus enlaces llevan su marca).
 */
export function caminoDe({ referente, busqueda, dominio }: { referente: string; busqueda: string; dominio: string }): Camino {
  const fuente = new URLSearchParams(busqueda).get("utm_source")?.trim().toLowerCase();
  if (fuente) return MARCAS[fuente] ?? "otros";
  let host = "";
  try {
    host = new URL(referente).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const propio = dominio.toLowerCase();
  if (!host || host === propio) return "directo";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(whatsapp\.com|whatsapp\.net|wa\.me)$/.test(host)) return "whatsapp";
  if (/(^|\.)google(\.[a-z]{2,3}){1,2}$/.test(host)) return "google";
  return "otros";
}

/**
 * El departamento aproximado, como lo guarda la base (ISO 3166-2): «PE-LAL» para La Libertad; fuera del Perú, solo el país («US»).
 * Sale de las cabeceras que Vercel le pone a cada petición (`x-vercel-ip-country` y `x-vercel-ip-country-region`). Sin ellas (en local,
 * o detrás de otro proxy) no hay departamento: `null`.
 */
export function regionDe(pais: string | null, region: string | null): string | null {
  const p = (pais ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(p)) return null;
  if (p !== "PE") return p;
  const r = (region ?? "").trim().toUpperCase().replace(/^PE-/, "");
  return /^[A-Z0-9]{1,3}$/.test(r) ? `PE-${r}` : "PE";
}

/** Un paso que manda el navegador: entró, vio una prenda, eligió talla. «A la bolsa» y «separó» los anota el servidor, no viajan por aquí. */
export type PasoDelNavegador =
  | { paso: 0; camino: Camino; hace_ms: number }
  | { paso: 1; producto: string; hace_ms: number }
  | { paso: 2; producto: string; variante: string; hace_ms: number };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const esIdDeLaBase = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const esCamino = (v: unknown): v is Camino => typeof v === "string" && (CAMINOS as readonly string[]).includes(v);
const esHace = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 * 60 * 60 * 1000;

/**
 * Lo que la ruta acepta: `{ pasos: [...] }`, como mucho 20. Un paso que no calza se descarta (la base vuelve a revisar todo); un cuerpo
 * que no es eso, o con más de 20, se rechaza entero (`null`).
 */
export function leerPasos(cuerpo: unknown): PasoDelNavegador[] | null {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return null;
  const lista = (cuerpo as { pasos?: unknown }).pasos;
  if (!Array.isArray(lista) || lista.length > TOPE_DE_PASOS) return null;
  const pasos: PasoDelNavegador[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const { paso, camino, producto, variante, hace_ms } = item as Record<string, unknown>;
    const hace = hace_ms === undefined ? 0 : hace_ms;
    if (!esHace(hace)) continue;
    if (paso === 0 && esCamino(camino)) pasos.push({ paso: 0, camino, hace_ms: hace });
    else if (paso === 1 && esIdDeLaBase(producto)) pasos.push({ paso: 1, producto, hace_ms: hace });
    else if (paso === 2 && esIdDeLaBase(producto) && esIdDeLaBase(variante)) pasos.push({ paso: 2, producto, variante, hace_ms: hace });
  }
  return pasos;
}

/** Los que no son personas (buscadores, vistas previas de enlaces, pruebas automáticas) no se cuentan. */
export const esRobot = (agente: string | null): boolean =>
  !agente || /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|bingpreview|petalbot|preview/i.test(agente);

/** ¿Empieza una visita nueva? Sí si nunca hubo una, si pasaron más de 30 minutos o si el reloj del aparato va para atrás. */
export function esVisitaNueva(ultima: number | null, ahora: number): boolean {
  if (ultima === null || !Number.isFinite(ultima)) return true;
  const pasaron = ahora - ultima;
  return pasaron < 0 || pasaron > MINUTOS_DE_UNA_VISITA * 60 * 1000;
}
