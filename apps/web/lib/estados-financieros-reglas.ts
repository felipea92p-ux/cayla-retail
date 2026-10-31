// Finanzas ▸ Estados financieros (ADR-0585, Felipe 2026-10-30; maqueta `docs/maquetas/finanzas-eeff-2026-10/`): los cuatro estados como
// cuatro respuestas, y esas respuestas son las pestañas.
//
// PROMETE: cuál es cada estado (su ruta, su nombre formal y su pregunta de tienda) y cómo se dice su respuesta en una línea, con la cifra
// que la base ya calculó. Lógica pura: la usan la cabecera (servidor) y su prueba.
// ASUME: toda cifra viene de la base (`fn_estado_resultados`, `fn_flujo_caja_real`, `fn_balance_general` + `fn_conciliacion_contable`,
// `fn_balance_por_tienda`, `fn_patrimonio_cambios`). Aquí no se suma plata: se elige la columna de la sede y se escribe la frase.
// Sin dato se dice por qué (principio 9): nunca un cero que no es.

import { soles } from "./flujo-caja-reglas";
import type { FilaER } from "./resultados-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "./finanzas-telar-reglas";

export type ClaveEstado = "ganamos" | "plata" | "vale" | "tuyo";

/** Los parámetros de la URL de una página (los que vienen sueltos): al pasar a otro estado viajan la sede y el mes. */
export const paramsDe = (sp: Readonly<Record<string, string | string[] | undefined>>): [string, string][] =>
  Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string");

/** El mes de la barra del telar (`?mes=AAAA-MM`), nunca uno que todavía no empieza; por defecto, el de hoy. */
export const mesDeLosEstados = (mes: string | undefined, hoy: string): string => {
  const deHoy = hoy.slice(0, 7);
  return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= deHoy ? mes : deHoy;
};

/** Los cuatro, en el orden de la pantalla: primero los que se miran cada mes, después los de vez en cuando. La ruta no se renombró. */
export const ESTADOS: readonly { clave: ClaveEstado; ruta: string; formal: string; pregunta: string }[] = [
  { clave: "ganamos", ruta: "/finanzas/reportes", formal: "Ganancias y pérdidas", pregunta: "¿Ganamos?" },
  { clave: "plata", ruta: "/finanzas/reportes/flujo", formal: "Flujo de efectivo", pregunta: "¿Dónde está la plata?" },
  { clave: "vale", ruta: "/finanzas/reportes/balance", formal: "Balance general", pregunta: "¿Cuánto vale CAYLA?" },
  { clave: "tuyo", ruta: "/finanzas/reportes/patrimonio", formal: "Cambios en el patrimonio", pregunta: "¿Lo tuyo creció?" },
];

/** Lo que dibuja una tarjeta. `valor: null` lleva su `motivo` (y `noSePudoLeer` si falló la lectura, no si falta el dato). */
export type RespuestaEstado = {
  clave: ClaveEstado;
  formal: string;
  pregunta: string;
  valor: number | null;
  /** Se escribe con su signo («+S/ 850»): un cambio, no un saldo. */
  conSigno: boolean;
  /** El veredicto en un punto de color (verde va bien, ámbar a medias, rojo hay que actuar). */
  punto: "verde" | "ambar" | "rojo" | null;
  /** Una línea de contexto, o el motivo si no hay cifra. */
  contexto: string;
  noSePudoLeer: boolean;
};

const base = (clave: ClaveEstado) => {
  const e = ESTADOS.find((x) => x.clave === clave)!;
  return { clave, formal: e.formal, pregunta: e.pregunta };
};
const sinDato = (clave: ClaveEstado, motivo: string, noSePudoLeer: boolean): RespuestaEstado => ({
  ...base(clave),
  valor: null,
  conSigno: false,
  punto: null,
  contexto: motivo,
  noSePudoLeer,
});

/** La columna del Estado de resultados que corresponde a la sede de la barra: todas → CAYLA (el consolidado), empresa → «De la empresa». */
export function filaDeLaSede(filas: readonly FilaER[], sede: ClaveSede): FilaER | null {
  if (sede === SEDE_TODAS) return filas.find((f) => f.unidad === "consolidado") ?? (filas.length === 1 ? filas[0]! : null);
  if (sede === SEDE_EMPRESA) return filas.find((f) => f.unidad === "empresa") ?? null;
  return filas.find((f) => f.ubicacionId === sede) ?? null;
}

export function respuestaGanamos(fila: Pick<FilaER, "resultado" | "ventas"> | null, falla: string | null): RespuestaEstado {
  if (falla) return sinDato("ganamos", "No se pudo leer el Estado de resultados.", true);
  if (!fila) return sinDato("ganamos", "Esta sede no tiene números este mes.", false);
  const gano = Math.round(fila.resultado) >= 0;
  return {
    ...base("ganamos"),
    valor: fila.resultado,
    conSigno: false,
    punto: gano ? "verde" : "rojo",
    contexto: fila.ventas > 0 ? `${gano ? "Sí" : "No"}: vendiste ${soles(fila.ventas)}` : gano ? "Sí" : "No: no vende, sus gastos los cubren las tiendas",
    noSePudoLeer: false,
  };
}

export function respuestaPlata(flujo: { saldoInicial: number; saldoFinal: number } | null, falla: string | null, deUnaSede: boolean): RespuestaEstado {
  if (falla) return sinDato("plata", "No se pudo leer el flujo de efectivo.", true);
  if (!flujo) return sinDato("plata", "Todavía no hay movimientos de plata.", false);
  const d = Math.round(flujo.saldoFinal - flujo.saldoInicial);
  const cambio = d === 0 ? "Igual que al empezar el mes" : `${d > 0 ? "Subió" : "Bajó"} ${soles(Math.abs(d))} en el mes`;
  return {
    ...base("plata"),
    valor: flujo.saldoFinal,
    conSigno: false,
    punto: d >= 0 ? "verde" : "ambar",
    contexto: deUnaSede ? `${cambio} · toda CAYLA` : cambio,
    noSePudoLeer: false,
  };
}

/**
 * CAYLA entera: lo tuyo del Balance (activo − pasivo), solo si la comprobación no bloquea (un número falso es peor que ninguno, como
 * la pantalla del Balance). Una sede: lo invertido en ella (`fn_balance_por_tienda`).
 */
export function respuestaVale(
  dato: { total: number; cuadra: boolean; sinArranque: boolean } | null,
  falla: string | null,
  sedeNombre: string | null
): RespuestaEstado {
  const r = sedeNombre ? { ...base("vale"), pregunta: "¿Cuánto hay invertido?" } : base("vale");
  if (falla) return { ...sinDato("vale", "No se pudo leer el Balance.", true), pregunta: r.pregunta };
  if (!dato) return { ...sinDato("vale", "Esta sede no tiene nada invertido que mostrar.", false), pregunta: r.pregunta };
  if (dato.sinArranque) return { ...sinDato("vale", "Faltan los saldos de arranque.", false), pregunta: r.pregunta };
  if (!dato.cuadra) return { ...sinDato("vale", "Todavía no cuadra: el Balance dice qué falta.", false), pregunta: r.pregunta };
  return {
    ...r,
    valor: dato.total,
    conSigno: false,
    punto: null,
    contexto: sedeNombre ? `Invertido en ${sedeNombre}` : "Lo que tiene menos lo que debe",
    noSePudoLeer: false,
  };
}

export type PatrimonioCambios = {
  mes: string;
  corte: string;
  arranque: string | null;
  sinArranque: boolean;
  inicio: { fecha: string; capital: number; aportes: number; utilidades: number; total: number } | null;
  fin: { fecha: string; capital: number; aportes: number; utilidades: number; total: number } | null;
  ganancia: number;
  aportes: number;
  retiros: number;
  /** Lo que la ganancia, los aportes y los retiros no explican. Debe ser 0: si no, se dice. */
  otros: number;
  serie: { mes: string; corte: string; total: number }[];
};

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const extremo = (v: unknown) => {
  if (!v || typeof v !== "object") return null;
  const e = v as Fila;
  return { fecha: String(e.fecha ?? ""), capital: num(e.capital), aportes: num(e.aportes), utilidades: num(e.utilidades), total: num(e.total) };
};

/** Lo que devuelve `fn_patrimonio_cambios` (los `numeric` del jsonb llegan como número o texto) → tipos de la pantalla. */
export function leerPatrimonio(data: unknown): PatrimonioCambios {
  const d = (data ?? {}) as Fila;
  return {
    mes: String(d.mes ?? "").slice(0, 7),
    corte: String(d.corte ?? ""),
    arranque: d.arranque == null ? null : String(d.arranque),
    sinArranque: d.sin_arranque === true,
    inicio: extremo(d.inicio),
    fin: extremo(d.fin),
    ganancia: num(d.ganancia),
    aportes: num(d.aportes),
    retiros: num(d.retiros),
    otros: num(d.otros),
    serie: (Array.isArray(d.serie) ? (d.serie as Fila[]) : []).map((s) => ({ mes: String(s.mes ?? "").slice(0, 7), corte: String(s.corte ?? ""), total: num(s.total) })),
  };
}

export function respuestaTuyo(p: PatrimonioCambios | null, falla: string | null): RespuestaEstado {
  if (falla) return sinDato("tuyo", "No se pudo leer lo tuyo.", true);
  if (!p || p.sinArranque || !p.inicio || !p.fin) return sinDato("tuyo", "Faltan los saldos de arranque.", false);
  const d = Math.round(p.fin.total - p.inicio.total);
  const partes = [`ganaste ${soles(p.ganancia)}`];
  if (Math.round(p.aportes)) partes.push(`pusiste ${soles(p.aportes)}`);
  if (Math.round(p.retiros)) partes.push(`retiraste ${soles(p.retiros)}`);
  const frase = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]!;
  return {
    ...base("tuyo"),
    valor: p.fin.total - p.inicio.total,
    conSigno: true,
    punto: d >= 0 ? "verde" : "rojo",
    contexto: frase.charAt(0).toUpperCase() + frase.slice(1),
    noSePudoLeer: false,
  };
}
