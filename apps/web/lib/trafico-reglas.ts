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
};

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
  for (let i = 1; i < 6; i++) {
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
