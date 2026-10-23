// Tienda web ▸ Tráfico (ADR-0495): lo puro de la pantalla — leer lo que devuelve `retail.resumen_trafico_web`, el período, «de cada 100»,
// el cambio contra los días de antes, dónde se atora el recorrido y si la tienda dejó de mandar visitas. Sin React y sin base: se prueba
// en `trafico-reglas.test.ts`. La base cuenta (personas por el paso más lejano al que llegaron); aquí solo se traduce a lo que se lee.

import { diaLima, horaLima, sumarDias } from "./fechas-lima";

/** Los pasos del recorrido, en orden: lo que se cuenta, cómo se llama y cómo se dice quien llegó o se fue ahí. */
export const PASOS = [
  { nombre: "Entraron", frase: "entraron a la tienda", fraseUna: "entró a la tienda", donde: "", seFueron: "" },
  { nombre: "Vieron una prenda", frase: "vieron una prenda", fraseUna: "vio una prenda", donde: "apenas entran", seFueron: "sin mirar ninguna prenda" },
  { nombre: "Eligieron talla", frase: "eligieron talla", fraseUna: "eligió talla", donde: "al elegir talla", seFueron: "sin elegir talla" },
  { nombre: "A la bolsa", frase: "la pusieron en la bolsa", fraseUna: "la puso en la bolsa", donde: "al ponerla en la bolsa", seFueron: "sin ponerla en la bolsa" },
  { nombre: "Separaron", frase: "separaron", fraseUna: "separó", donde: "al separar", seFueron: "sin separar" },
  { nombre: "Recogieron", frase: "recogieron en la tienda", fraseUna: "recogió en la tienda", donde: "al recoger", seFueron: "sin recoger" },
] as const;

export type ResumenTrafico = {
  desde: string;
  hasta: string;
  anteriorDesde: string;
  anteriorHasta: string;
  /** Personas que llegaron AL MENOS hasta cada paso (6 cifras que nunca crecen). */
  pasos: number[];
  /** Personas que entraron en los días de antes, del mismo largo. */
  anterior: number;
  /** Los mismos 6 pasos de los últimos 90 días de toda la tienda: el «de costumbre» de dónde se atora. */
  base: number[];
  ahora: number;
  ultimoDato: string | null;
  /** Las prendas que alguien miró en el período, de la más mirada a la menos (actividad 5). */
  prendas: PrendaTrafico[];
};

/** Cómo se dice cada camino en pantalla (la base guarda la clave: `retail.trafico_web.camino`). */
export const CAMINOS = {
  instagram: "Instagram",
  directo: "Directo",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  google: "Google",
  qr: "El QR de la tienda",
  otros: "Otros",
} as const;
export type Camino = keyof typeof CAMINOS;
const esCamino = (v: unknown): v is Camino => typeof v === "string" && Object.hasOwn(CAMINOS, v);

export type ColorTrafico = { codigo: string; nombre: string; hex: string | null };

/** Una prenda del período: hasta dónde llegó con ella cada persona (5 cifras que nunca crecen), lo que eligieron y de dónde vinieron. */
export type PrendaTrafico = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  precio: number | null;
  foto: string | null;
  coloresCatalogo: ColorTrafico[];
  /** La miraron · eligieron talla · a la bolsa · la separaron · la recogieron. */
  recorrido: [number, number, number, number, number];
  /** Cuántas personas la miraron en los días de antes, del mismo largo. */
  anterior: number;
  tallas: { talla: string; n: number }[];
  colores: (ColorTrafico & { n: number })[];
  caminos: { camino: Camino; n: number }[];
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
const leerColor = (c: Record<string, unknown>): ColorTrafico | null =>
  texto(c.codigo) && texto(c.nombre) ? { codigo: c.codigo as string, nombre: c.nombre as string, hex: texto(c.hex) } : null;

/** Una prenda de lo que devuelve la base, o `null` si no tiene la forma esperada (se salta esa prenda, no se cae la vitrina). */
function leerPrenda(p: Record<string, unknown>): PrendaTrafico | null {
  const recorrido = [p.miraron, p.talla, p.bolsa, p.separaron, p.recogieron];
  if (!texto(p.id) || !texto(p.nombre) || !recorrido.every(esCifra) || !esCifra(p.anterior)) return null;
  const precio = typeof p.precio === "number" ? p.precio : typeof p.precio === "string" && p.precio.trim() !== "" ? Number(p.precio) : null;
  return {
    id: p.id as string,
    nombre: p.nombre as string,
    codigo: texto(p.codigo),
    categoria: texto(p.categoria),
    prefijo: texto(p.prefijo),
    familia: texto(p.familia),
    precio: precio !== null && Number.isFinite(precio) ? precio : null,
    foto: texto(p.foto),
    coloresCatalogo: lista(p.colores_catalogo).map(leerColor).filter((c): c is ColorTrafico => c !== null),
    recorrido: recorrido as PrendaTrafico["recorrido"],
    anterior: p.anterior as number,
    tallas: lista(p.tallas).flatMap((t) => (texto(t.talla) && esCifra(t.n) ? [{ talla: t.talla as string, n: t.n }] : [])),
    colores: lista(p.colores).flatMap((c) => {
      const color = leerColor(c);
      return color && esCifra(c.n) ? [{ ...color, n: c.n }] : [];
    }),
    caminos: lista(p.caminos).flatMap((c) => (esCamino(c.camino) && esCifra(c.n) ? [{ camino: c.camino, n: c.n }] : [])),
  };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esCifra = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const seisCifras = (v: unknown): v is number[] => Array.isArray(v) && v.length === 6 && v.every(esCifra);

/** Lo que devuelve la base, o `null` si no tiene la forma esperada (una base vieja, un error): la pantalla lo dice, no inventa. */
export function leerResumen(datos: unknown): ResumenTrafico | null {
  if (!datos || typeof datos !== "object") return null;
  const d = datos as Record<string, unknown>;
  const fechas = [d.desde, d.hasta, d.anterior_desde, d.anterior_hasta];
  if (!fechas.every((f) => typeof f === "string" && FECHA.test(f))) return null;
  if (!seisCifras(d.pasos) || !seisCifras(d.base) || !esCifra(d.anterior) || !esCifra(d.ahora)) return null;
  const ultimo = typeof d.ultimo_dato === "string" && !Number.isNaN(Date.parse(d.ultimo_dato)) ? d.ultimo_dato : null;
  return {
    desde: d.desde as string,
    hasta: d.hasta as string,
    anteriorDesde: d.anterior_desde as string,
    anteriorHasta: d.anterior_hasta as string,
    pasos: d.pasos,
    anterior: d.anterior,
    base: d.base,
    ahora: d.ahora,
    ultimoDato: ultimo,
    // Una base de antes de la actividad 5 no trae prendas: la vitrina sale vacía, no rota.
    prendas: lista(d.prendas).map(leerPrenda).filter((p): p is PrendaTrafico => p !== null),
  };
}

/** Los últimos 7 días contando hoy (Lima). */
export const periodoSieteDias = (hoy: string) => ({ desde: sumarDias(hoy, -6), hasta: hoy });

/** «De cada 100» redondeado; 0 si no hay de dónde contar. */
export const de100 = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Con menos de 20 personas antes, un porcentaje engaña (de 3 a 6 es «100 % más»): no se compara. */
export const MINIMO_PARA_COMPARAR = 20;

/** Cuánto cambió, en % redondeado, contra los días de antes; `null` si antes hubo muy poca gente para comparar. */
export function cambio(total: number, anterior: number): number | null {
  if (anterior < MINIMO_PARA_COMPARAR) return null;
  return Math.round(((total - anterior) / anterior) * 100);
}

/** Peso del «de costumbre» al decidir dónde se atora: con pocas personas, manda lo de toda la tienda; con muchas, lo de estos días. */
export const PESO_DE_LA_COSTUMBRE = 30;
/** Con menos de esto en el paso de antes, el veredicto se dice como pista. */
export const POCAS_PERSONAS = 30;

export type Atora = {
  /** El paso donde se atora (1 a 5): el que deja pasar a menos gente de la que le llega. */
  i: number;
  llegaron: number;
  siguieron: number;
  /** De cada 100 que llegaron al paso de antes, cuántos se fueron (lo que pasó de verdad en estos días). */
  seFueronDe100: number;
  /** Muy poca gente: el veredicto es una pista, no una regla. */
  pocas: boolean;
};

/**
 * Dónde se atora el recorrido: el paso que deja pasar a menos gente de la que le llega. Para no saltar con dos personas, cada paso se
 * mira contraído hacia lo de costumbre (los últimos 90 días de toda la tienda), con el peso de 30 personas: (siguieron + 30 · costumbre) /
 * (llegaron + 30). Lo que se DICE es lo que pasó en estos días. Sin nadie que haya entrado, no hay veredicto.
 */
export function dondeSeAtora(pasos: readonly number[], base: readonly number[]): Atora | null {
  if (!pasos[0]) return null;
  let mejor: { i: number; pasa: number } | null = null;
  for (let i = 1; i < pasos.length; i++) {
    const llegaron = pasos[i - 1];
    const costumbre = base[i - 1] > 0 ? base[i] / base[i - 1] : null;
    if (llegaron === 0 && costumbre === null) continue;
    const pasa = costumbre === null ? pasos[i] / llegaron : (pasos[i] + PESO_DE_LA_COSTUMBRE * costumbre) / (llegaron + PESO_DE_LA_COSTUMBRE);
    if (!mejor || pasa < mejor.pasa) mejor = { i, pasa };
  }
  if (!mejor) return null;
  const llegaron = pasos[mejor.i - 1];
  const siguieron = pasos[mejor.i];
  return { i: mejor.i, llegaron, siguieron, seFueronDe100: 100 - de100(siguieron, llegaron), pocas: llegaron < POCAS_PERSONAS };
}

/** «Se atora al separar» y la frase que lo explica con números de estos días. */
export function fraseAtora(a: Atora): { titular: string; frase: string } {
  const paso = PASOS[a.i];
  const antes = PASOS[a.i - 1];
  const titular = `Se atora ${paso.donde}`;
  if (!a.llegaron) return { titular, frase: "en estos días nadie llegó hasta ahí; de costumbre, es donde más gente se va." };
  return { titular, frase: `de cada 100 que ${antes.frase}, ${a.seFueronDe100} se fueron ${paso.seFueron}.` };
}

/** Lo que dice el «¿Por qué?»: qué mide el veredicto y, con poca gente, que es una pista. */
export function explicaAtora(a: Atora): string {
  const paso = PASOS[a.i];
  const antes = PASOS[a.i - 1];
  const quienes = a.llegaron === 1 ? `de 1 persona que ${antes.fraseUna}` : `de ${personas(a.llegaron)} que ${antes.frase}`;
  const siguieron = a.siguieron === 1 ? `1 ${paso.fraseUna}` : `${miles(a.siguieron)} ${paso.frase}`;
  const base = `Es el paso que deja pasar a menos gente de la que le llega: ${quienes}, ${siguieron}. Los demás pasos pierden menos gente de la que les llega.`;
  return a.pocas ? `${base} Con tan poca gente, tómalo como una pista: se compara con lo de costumbre de toda la tienda.` : base;
}

/** Los pasos del recorrido de UNA prenda: desde que la miraron (el paso «Vieron una prenda» de toda la tienda). */
export const PASOS_DE_LA_PRENDA = [
  { nombre: "La miraron", seFueron: "" },
  { nombre: "Eligieron talla", seFueron: "sin elegir talla" },
  { nombre: "La pusieron en la bolsa", seFueron: "sin ponerla en la bolsa" },
  { nombre: "La separaron", seFueron: "sin separarla" },
  { nombre: "La recogieron", seFueron: "sin recogerla" },
] as const;

/**
 * Dónde se atora UNA prenda: la misma cuenta que el recorrido de la tienda, contraída hacia lo de costumbre de toda la tienda desde
 * «vieron una prenda». Con pocas personas no se dice (una prenda que miraron 4 personas no tiene un paso «malo»: tiene 4 personas).
 */
export function dondeSeAtoraLaPrenda(p: PrendaTrafico, base: readonly number[]): Atora | null {
  const a = dondeSeAtora(p.recorrido, base.slice(1));
  return a && !a.pocas ? a : null;
}

/** «De cada 100 que vieron una prenda, cuántos miraron esta». */
export const de100QueVieron = (p: PrendaTrafico, vieron: number) => de100(p.recorrido[0], vieron);

/** «12 % más que antes», «Igual que antes» o «Sin comparación» (con menos de 20 antes, un porcentaje engaña). */
export function cambioDeLaPrenda(p: PrendaTrafico): { tono: "verde" | "ambar" | "neutro"; texto: string; sube: number | null } {
  const c = cambio(p.recorrido[0], p.anterior);
  if (c === null) return { tono: "neutro", texto: "Pocas personas para comparar", sube: null };
  if (c === 0) return { tono: "neutro", texto: "Igual que antes", sube: 0 };
  return { tono: c > 0 ? "verde" : "ambar", texto: `${Math.abs(c)} % ${c > 0 ? "más" : "menos"} que antes`, sube: c };
}

export const miles = (n: number) => n.toLocaleString("es-PE");
export const personas = (n: number) => `${miles(n)} ${n === 1 ? "persona" : "personas"}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** «3:10 p. m.» de un instante, en Lima. */
export function horaCorta(instante: string): string | null {
  const h = horaLima(instante);
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  const doce = hh % 12 === 0 ? 12 : hh % 12;
  return `${doce}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

/**
 * ¿La tienda dejó de mandar visitas? Solo en horario de tienda (de 9 de la mañana a 10 de la noche, Lima) y si el último paso que llegó
 * tiene más de 2 horas: entonces la pantalla no muestra un cero falso, dice desde cuándo no llega nada. De madrugada, el silencio es normal.
 */
export function sinNoticias(ultimoDato: string | null, ahora: Date): { desde: string } | null {
  if (!ultimoDato) return null;
  const horaAhora = Number((horaLima(ahora.toISOString()) ?? "0:00").split(":")[0]);
  if (horaAhora < 9 || horaAhora >= 22) return null;
  if (ahora.getTime() - Date.parse(ultimoDato) <= 2 * 60 * 60 * 1000) return null;
  const hora = horaCorta(ultimoDato) ?? "";
  const mismoDia = diaLima(ultimoDato) === diaLima(ahora.toISOString());
  return { desde: mismoDia ? `las ${hora}` : `el ${fechaLarga(diaLima(ultimoDato) ?? "")}, ${hora}` };
}
