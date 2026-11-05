// Plan de campaña ▸ Calendario ▸ «Qué dice tu historia» (ADR-0525, tarea #8 de la auditoría, Felipe 2026-10-26, spike ①): cuánto sube la venta de una tienda en cada campaña, año
// por año, con la MISMA vara del Historial y de Resultados (`medir`: soles por día de la campaña ÷ soles por día de los 60 días de antes) y un veredicto en palabras de tienda.
// Lógica pura, sin React ni red.
//
// EL PROBLEMA. «Solo Navidad duplica» era una frase sin respaldo. Para decidir con cuáles campañas me quedo hace falta ver, campaña por campaña, qué dijeron los años que ya pasaron;
// y verlo con la misma cuenta que el resto del Plan, no con una segunda definición de «cuánto sube».
//
// CONTRATO
//   PROMETE: un año cuenta solo si se pudo medir de verdad (la campaña ya terminó, la tienda tenía historia y la base de 60 días tenía ventas): nunca un cero inventado ni un año
//            «en curso»; el número es la mediana de esos años (con el menor y el mayor a la vista); y el veredicto sale solo de la mediana, con la advertencia de «poca historia»
//            cuando son menos de tres años. Mide los SOLES de la tienda entera, no una categoría ni unidades: si se vende con descuento, se venden más prendas por menos soles.
//   NO HACE: no lee la base (eso es `plan-compra-calendario-servidor.ts`), no decide cuáles campañas se miran ni sus fechas, y no dibuja nada.

import {
  diasEntre,
  inicioDeDatos,
  medir,
  sumarDias,
  textoMultiplicador,
  type LecturaHistorial,
  type TiendaHistorial,
} from "./plan-compra-historial";

/** Cuántos años hacen falta para no decir «poca historia». */
export const MIN_ANIOS_SIN_ADVERTENCIA = 3;
/** Cuántos días pide `fn_historial_ventas` como máximo por llamada: la base rechaza un rango de más de 1200 días entre las dos fechas, y 1200 días contados de punta a punta son 1199 de diferencia. */
export const DIAS_POR_LECTURA = 1200;
/** La escala de la barra de rango: de «la mitad de un día normal» a «el triple». */
export const ESCALA_DESDE = 0.5;
export const ESCALA_HASTA = 3;

export type EvidenciaDeCampana = {
  /** Cuántas veces lo de un día normal: la mediana de los años medidos. */
  mediana: number;
  min: number;
  max: number;
  /** El año del menor y del mayor, para decir cuándo fue. */
  anioDelMin: number;
  anioDelMax: number;
  /** Los años medidos, del más viejo al más nuevo. */
  porAnio: { anio: number; multiplicador: number }[];
};

const mediana = (xs: readonly number[]): number => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Lo que dijo la historia de una campaña en una tienda: el multiplicador de cada año en que se pudo medir. `fechasEn` lleva la campaña a un año (null si ese año no tiene
 * fechas). null si ningún año se pudo medir: sin historia propia, y nunca un número inventado.
 */
export function evidenciaDeCampana(
  l: Pick<LecturaHistorial, "hoy" | "dias">,
  t: TiendaHistorial,
  fechasEn: (anio: number) => { desde: string; hasta: string } | null,
  anios: readonly number[],
): EvidenciaDeCampana | null {
  const porAnio: { anio: number; multiplicador: number }[] = [];
  for (const anio of [...anios].sort((a, b) => a - b)) {
    const f = fechasEn(anio);
    if (!f) continue;
    const m = medir(l, t, f.desde, f.hasta);
    if (m.estado === "medida" && !m.enCurso && m.multiplicador !== null) porAnio.push({ anio, multiplicador: m.multiplicador });
  }
  if (porAnio.length === 0) return null;
  const menor = porAnio.reduce((a, x) => (x.multiplicador < a.multiplicador ? x : a));
  const mayor = porAnio.reduce((a, x) => (x.multiplicador > a.multiplicador ? x : a));
  return { mediana: mediana(porAnio.map((x) => x.multiplicador)), min: menor.multiplicador, max: mayor.multiplicador, anioDelMin: menor.anio, anioDelMax: mayor.anio, porAnio };
}

/** La mediana, el menor y el mayor de un grupo de años medidos; null si no hay ninguno. */
export function resumenDeAnios(porAnio: readonly { multiplicador: number }[]): { mediana: number; min: number; max: number } | null {
  if (porAnio.length === 0) return null;
  const xs = porAnio.map((x) => x.multiplicador);
  return { mediana: mediana(xs), min: Math.min(...xs), max: Math.max(...xs) };
}

/** La tienda con la que se mide: la que tiene más historia (la que empieza antes); a igual historia, la de nombre primero. null si ninguna tiene datos. */
export function tiendaDeReferencia(l: Pick<LecturaHistorial, "tiendas">): TiendaHistorial | null {
  const con = l.tiendas.flatMap((t) => {
    const inicio = inicioDeDatos(t);
    return inicio ? [{ t, inicio }] : [];
  });
  con.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.t.nombre.localeCompare(b.t.nombre, "es"));
  return con[0]?.t ?? null;
}

/**
 * Los años que vale la pena mirar: del primero con historia de la tienda hasta el de hoy. (Los de hoy solo cuentan si la campaña ya terminó: lo decide `medir`.)
 */
export function aniosAMedir(t: TiendaHistorial, hoy: string): number[] {
  const inicio = inicioDeDatos(t);
  if (!inicio) return [];
  const fin = Number(hoy.slice(0, 4));
  return Array.from({ length: Math.max(0, fin - Number(inicio.slice(0, 4)) + 1) }, (_, i) => Number(inicio.slice(0, 4)) + i);
}

// ---------------------------------------------------------------------------------------------------------------------
// El veredicto, en palabras de tienda
// ---------------------------------------------------------------------------------------------------------------------

export type VeredictoDeCampana = { texto: string; tono: "verde" | "neutro" | "ambar" };

/** Lo que dice la mediana: ≥ ×1,5 «Pico claro»; ≥ ×1,1 «Sube un poco»; ≥ ×0,95 «No se nota»; menos, «No sube». Sin historia, lo dice. */
export function veredictoDe(ev: Pick<EvidenciaDeCampana, "mediana"> | null): VeredictoDeCampana {
  if (!ev) return { texto: "Sin historia propia", tono: "neutro" };
  if (ev.mediana >= 1.5) return { texto: "Pico claro", tono: "verde" };
  if (ev.mediana >= 1.1) return { texto: "Sube un poco", tono: "verde" };
  if (ev.mediana >= 0.95) return { texto: "No se nota", tono: "neutro" };
  return { texto: "No sube", tono: "ambar" };
}

/**
 * «×1.1». Un multiplicador menor de ×0.1 (un año con las tiendas casi cerradas) lleva dos decimales: «×0.0» parecería un error, y «×0.04» dice la verdad. El Historial sigue con un
 * decimal para todos (es otra pantalla, con otra tabla); aquí un año raro es justo lo que se quiere ver.
 */
export const multiplicadorLegible = (m: number): string => (m > 0 && m < 0.1 ? `×${m.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : textoMultiplicador(m));

/** «5 años» / «1 año». */
export const textoDeAnios = (n: number): string => `${n} ${n === 1 ? "año" : "años"}`;

/** Con menos de tres años, la mediana y el rango dicen poco: la pantalla lo avisa («1 año: poca historia»). */
export const pocaHistoria = (ev: Pick<EvidenciaDeCampana, "porAnio">): boolean => ev.porAnio.length < MIN_ANIOS_SIN_ADVERTENCIA;

/** Lo que dice la barra al pasar el mouse: «Mediana ×1.1; entre ×0.9 y ×1.3 en 7 años». */
export const ayudaDelRango = (ev: EvidenciaDeCampana): string =>
  `Mediana ${multiplicadorLegible(ev.mediana)}; entre ${multiplicadorLegible(ev.min)} y ${multiplicadorLegible(ev.max)} en ${textoDeAnios(ev.porAnio.length)}`;

/**
 * Cuándo un año se aparta mucho de los demás: el menor, si es menos de las dos terceras partes de la mediana y hay al menos tres años con qué comparar. No dice POR QUÉ
 * (el sistema no sabe de pandemias ni de cierres): invita a mirar si fue un año raro, que lo sabe quien conoce el negocio.
 */
export function notaDelAnioRaro(ev: EvidenciaDeCampana): string | null {
  if (ev.porAnio.length < MIN_ANIOS_SIN_ADVERTENCIA || !(ev.min < (2 / 3) * ev.mediana)) return null;
  return `El ${multiplicadorLegible(ev.min)} es de ${ev.anioDelMin}: se aparta de los demás años. Mira si ese año fue raro (tiendas cerradas, por ejemplo).`;
}

/** La posición (0 a 100) de un multiplicador en la barra de rango. */
export const posicionEnLaEscala = (v: number): number => Math.min(100, Math.max(0, ((v - ESCALA_DESDE) / (ESCALA_HASTA - ESCALA_DESDE)) * 100));

// ---------------------------------------------------------------------------------------------------------------------
// Cómo se lee la historia: varias llamadas, una sola lectura
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Las ventanas de fechas que cubren `[desde, hasta]` sin encimarse, de la más nueva a la más vieja, de `maximo` días como mucho cada una (la base no deja pedir más de
 * 1200 por llamada). Vacío si el rango es al revés.
 */
export function ventanasDeLectura(desde: string, hasta: string, maximo: number = DIAS_POR_LECTURA): { desde: string; hasta: string }[] {
  const ventanas: { desde: string; hasta: string }[] = [];
  for (let fin = hasta; fin >= desde; ) {
    const ini = sumarDias(fin, -(maximo - 1));
    const inicio = ini > desde ? ini : desde;
    ventanas.push({ desde: inicio, hasta: fin });
    if (diasEntre(desde, inicio) <= 0) break;
    fin = sumarDias(inicio, -1);
  }
  return ventanas;
}

/**
 * Une las lecturas de varias ventanas en una sola: las tiendas y los meses son los mismos en todas (la base los manda enteros cada vez) y los días se juntan. Con una ventana
 * encimada gana la última que trae el día (la misma cifra: la base responde lo mismo). null si no hay ninguna.
 */
export function unirHistoriales(ls: readonly LecturaHistorial[]): LecturaHistorial | null {
  if (ls.length === 0) return null;
  const dias = new Map<string, Map<string, number>>();
  for (const l of ls) {
    for (const [tienda, porDia] of l.dias) {
      const destino = dias.get(tienda) ?? dias.set(tienda, new Map()).get(tienda)!;
      for (const [f, s] of porDia) destino.set(f, s);
    }
  }
  return { hoy: ls[0].hoy, tiendas: ls[0].tiendas, meses: ls[0].meses, dias };
}
