// Eficiencia del Taller: lo que la pantalla DICE (2026-11-26, «Producción más clara»). Puro: sin Supabase ni React.
//
// Las cuentas viven en `eficiencia-reglas.ts` y aquí no se repite ninguna: este archivo solo las pone en palabras de tienda y en las piezas que la
// pantalla dibuja. La pantalla responde UNA pregunta —cuánto cuesta hacer una prenda— y cada dato va en su pieza (un par «rótulo y valor», una fila
// con su barra), nunca en una frase que los junte.
//
// CONTRATO
//   PROMETE: que nunca sale un «S/ 0.00» que parezca dato: sin planilla se muestra lo que sí hay (los materiales por prenda) y se dice qué falta; sin
//            prendas, se dice que no hubo. Que la variación se dice en soles y contra el mismo dato del período anterior.
//   ASUME:   los períodos llegan del más reciente al más viejo (`ventanasDePeriodos`).
//   NO HACE: no calcula costos ni decide qué entra a la cuenta.

import { soles } from "./compras-reglas";
import { repartoDelGasto, type EficienciaPeriodo, type PartePlata, type VentanaPeriodo } from "./eficiencia-reglas";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const mayuscula = (t: string) => t.charAt(0).toLocaleUpperCase("es") + t.slice(1);
const mesDe = (iso: string) => Number(iso.slice(5, 7)) - 1;
const diaLargo = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[mesDe(iso)]}`;
const entero = (n: number) => n.toLocaleString("es-PE");

// ---------- Cómo se llama un período ----------

export type NombreDePeriodo = {
  /** En su píldora: «Noviembre». */
  pildora: string;
  /** Al empezar una frase: «En noviembre». */
  enFrase: string;
  /** Al comparar contra él: «en octubre» («S/ 2.10 menos que en octubre»). */
  comparado: string;
  /** Bajo su barra: «Nov». */
  corto: string;
  /** Sus fechas exactas, para el «?»: «Del 29 de octubre al 28 de noviembre». */
  fechas: string;
};

/**
 * El nombre de cada período, por su clave. Un período se llama por el mes en que CIERRA: el de la planilla va del 29 al 28, así que «29 oct – 28 nov»
 * es noviembre. Si dos períodos cerraran en el mismo mes el nombre ya no los distingue, y todos se dicen por sus fechas.
 */
export function nombresDePeriodos(ventanas: readonly VentanaPeriodo[]): Map<string, NombreDePeriodo> {
  const meses = ventanas.map((v) => mesDe(v.fin));
  const sinRepetir = new Set(meses).size === meses.length;
  return new Map(
    ventanas.map((v) => {
      const fechas = `Del ${diaLargo(v.ini)} al ${diaLargo(v.fin)}`;
      if (!sinRepetir) return [v.clave, { pildora: v.etiqueta, enFrase: fechas, comparado: "el período anterior", corto: v.etiqueta, fechas }];
      const mes = MESES[mesDe(v.fin)];
      return [v.clave, { pildora: mayuscula(mes), enFrase: `En ${mes}`, comparado: `en ${mes}`, corto: mayuscula(mes.slice(0, 3)), fechas }];
    })
  );
}

// ---------- El bloque principal ----------

export type InsigniaDeVariacion = { texto: string; tono: "verde" | "ambar" | "neutro" };

/**
 * Cuánto cambió frente al período anterior, en soles: «S/ 2.10 menos que en octubre». Que baje es bueno (verde) y que suba pide mirar (ámbar); igual, o
 * sin con qué comparar, no dice ni lo uno ni lo otro.
 */
export function variacionEnSoles(actual: number | null, anterior: number | null, comparado: string | null): InsigniaDeVariacion {
  if (actual === null || anterior === null || comparado === null) return { texto: "Sin período anterior para comparar", tono: "neutro" };
  const cambio = actual - anterior;
  if (Math.abs(cambio) < 0.005) return { texto: `Igual que ${comparado}`, tono: "neutro" };
  return cambio < 0 ? { texto: `${soles(-cambio)} menos que ${comparado}`, tono: "verde" } : { texto: `${soles(cambio)} más que ${comparado}`, tono: "ambar" };
}

export type CostoDelPeriodo = {
  /** La frase sobre la cifra: «En noviembre, hacer una prenda costó». */
  rotulo: string;
  /** La cifra grande, en soles. `null` si no hay ninguna que mostrar (no hubo prendas). */
  valor: number | null;
  /** Qué falta para el costo completo, en una línea; `null` si la cifra ya lo es. */
  falta: string | null;
  /** Contra el período anterior; `null` si no hay cifra. */
  insignia: InsigniaDeVariacion | null;
};

/**
 * Lo que dice el bloque principal. Con planilla, el costo de una prenda. Sin planilla NO se inventa: se muestran los materiales por prenda y se dice que
 * falta la planilla. Sin prendas, se dice que no hubo.
 */
export function costoDelPeriodo(actual: EficienciaPeriodo, anterior: EficienciaPeriodo | null, nombre: NombreDePeriodo, nombreAnterior: NombreDePeriodo | null): CostoDelPeriodo {
  const comparado = nombreAnterior?.comparado ?? null;
  if (actual.prendasBuenas === 0) return { rotulo: `${nombre.enFrase} no se cerró ninguna orden`, valor: null, falta: "Sin prendas buenas no hay costo por prenda.", insignia: null };
  if (actual.costoPorPrenda !== null) {
    return { rotulo: `${nombre.enFrase}, hacer una prenda costó`, valor: actual.costoPorPrenda, falta: null, insignia: variacionEnSoles(actual.costoPorPrenda, anterior?.costoPorPrenda ?? null, comparado) };
  }
  return {
    rotulo: `${nombre.enFrase}, los materiales de una prenda costaron`,
    valor: actual.materialesPorPrenda,
    falta: "Falta la planilla para el costo completo.",
    insignia: actual.materialesPorPrenda === null ? null : variacionEnSoles(actual.materialesPorPrenda, anterior?.materialesPorPrenda ?? null, comparado),
  };
}

export type ParteDelCosto = { clave: "materiales" | "conversion"; etiqueta: string; monto: number; /** El largo de su barra, de 0 a 100, a escala de la parte mayor. */ pct: number };

/** «De qué se forma» el costo de una prenda: solo las partes que se conocen (sin planilla, la mano de obra no se muestra en cero: no se muestra). */
export function formaDelCosto(actual: EficienciaPeriodo): ParteDelCosto[] {
  const partes: [ParteDelCosto["clave"], string, number | null][] = [
    ["materiales", "Materiales", actual.materialesPorPrenda],
    ["conversion", "Mano de obra y gastos", actual.conversionPorPrenda],
  ];
  const conocidas = partes.filter((p): p is [ParteDelCosto["clave"], string, number] => p[2] !== null);
  const mayor = Math.max(0, ...conocidas.map(([, , monto]) => monto));
  return conocidas.map(([clave, etiqueta, monto]) => ({ clave, etiqueta, monto, pct: mayor > 0 ? (monto / mayor) * 100 : 0 }));
}

/** Cuántas salieron buenas, en palabras de tienda: «97 de cada 100». Solo dice «Todas» si de verdad fueron todas (99,6 % no es «todas»). */
export function deCada100(calidad: number | null): string | null {
  if (calidad === null) return null;
  if (calidad >= 1) return "Todas";
  return `${Math.max(0, Math.floor(calidad * 100))} de cada 100`;
}

export type ParDelPeriodo = { clave: "prendas" | "ordenes" | "calidad" | "entregas" | "sin_fecha"; rotulo: string; valor: string; tono: "tinta" | "ambar" };

/**
 * Los datos del período, cada uno en su pieza. «Entregas a tiempo» cuenta solo las órdenes que tenían fecha de entrega («7 de 9», en ámbar si alguna se
 * cerró tarde); las que no tenían fecha se dicen aparte y solo si las hay. Sin órdenes cerradas no hay nada que decir.
 */
export function paresDelPeriodo(actual: EficienciaPeriodo): ParDelPeriodo[] {
  if (actual.ordenesCerradas === 0) return [];
  const pares: ParDelPeriodo[] = [
    { clave: "prendas", rotulo: "Prendas buenas", valor: entero(actual.prendasBuenas), tono: "tinta" },
    { clave: "ordenes", rotulo: "Órdenes cerradas", valor: entero(actual.ordenesCerradas), tono: "tinta" },
  ];
  const buenas = deCada100(actual.calidad);
  if (buenas !== null) pares.push({ clave: "calidad", rotulo: "Salieron buenas", valor: buenas, tono: "tinta" });
  const { aTiempo, tarde, sinFecha } = actual.entregas;
  if (aTiempo + tarde > 0) pares.push({ clave: "entregas", rotulo: "Entregas a tiempo", valor: `${aTiempo} de ${aTiempo + tarde}`, tono: tarde > 0 ? "ambar" : "tinta" });
  if (sinFecha > 0) pares.push({ clave: "sin_fecha", rotulo: "Sin fecha de entrega", valor: entero(sinFecha), tono: "tinta" });
  return pares;
}

// ---------- En qué se fue la plata ----------

export type FilaDelGasto = {
  clave: PartePlata["clave"];
  etiqueta: string;
  monto: number;
  /** «44 %» del total gastado. */
  porcentaje: string;
  /** El largo de su barra, de 0 a 100, a escala de la parte mayor. */
  pct: number;
  /** Solo en los gastos generales: de qué fueron, cada categoría con su monto. */
  detalle: { categoria: string; total: number }[];
};

/** Cada parte del gasto en su fila, con su barra a escala de la mayor. Los gastos generales traen de qué fueron. Vacío si no se gastó nada. */
export function filasDelGasto(actual: EficienciaPeriodo): FilaDelGasto[] {
  const reparto = repartoDelGasto(actual);
  const mayor = Math.max(0, ...reparto.map((p) => p.monto));
  return reparto.map((p) => ({
    clave: p.clave,
    etiqueta: p.etiqueta,
    monto: p.monto,
    porcentaje: `${Math.round(p.parte * 100)} %`,
    pct: mayor > 0 ? (p.monto / mayor) * 100 : 0,
    detalle: p.clave === "gastos" ? actual.gastosPorCategoria.map((g) => ({ categoria: mayuscula(g.categoria), total: g.total })) : [],
  }));
}

/** De qué está hecha la cifra de la planilla, para el «?»: es el costo total para CAYLA, no solo los sueldos. */
export function textoDeLaPlanilla(personas: number): string {
  return `La planilla es el costo total para CAYLA de ${personas === 1 ? "1 persona" : `${entero(personas)} personas`}: sueldos, provisiones de gratificación, CTS y vacaciones, y aportes, tal como se pagó.`;
}

// ---------- Mes a mes ----------

export type BarraDeMes = { clave: string; etiqueta: string; valor: number; /** Lo que va sobre la barra: «38.40», o «—» si ese período no tiene el dato. */ cifra: string; /** Lo que oye el lector al llegar a la barra. */ aria: string };

export type MesesDeEficiencia = { titulo: string; barras: BarraDeMes[] };

/**
 * Las barras de «mes a mes», del período más viejo al más reciente. Se grafica el costo por prenda; si NINGÚN período lo tiene (no hay planilla), se
 * grafican los materiales por prenda y el título lo dice. Un período sin el dato no dibuja barra y lleva «—».
 */
export function mesesDeEficiencia(periodos: readonly EficienciaPeriodo[], nombres: ReadonlyMap<string, NombreDePeriodo>): MesesDeEficiencia {
  const hayCosto = periodos.some((p) => p.costoPorPrenda !== null);
  const que = hayCosto ? "Costo por prenda" : "Materiales por prenda";
  const barras = [...periodos].reverse().map((p) => {
    const valor = hayCosto ? p.costoPorPrenda : p.materialesPorPrenda;
    const nombre = nombres.get(p.ventana.clave);
    const pildora = nombre?.pildora ?? p.ventana.etiqueta;
    return {
      clave: p.ventana.clave,
      etiqueta: nombre?.corto ?? p.ventana.etiqueta,
      valor: valor ?? 0,
      cifra: valor === null ? "—" : valor.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      aria: valor === null ? `${pildora}: sin dato` : `${pildora}: ${soles(valor)} por prenda`,
    };
  });
  return { titulo: `${que}, mes a mes`, barras };
}
