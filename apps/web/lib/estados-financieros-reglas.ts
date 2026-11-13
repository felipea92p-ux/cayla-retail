// Finanzas ▸ Estados financieros (ADR-0585, ADR-0611): los cuatro estados, que son las cuatro pestañas.
//
// PROMETE: cuál es cada estado (su ruta y su nombre) y de qué fila del Estado de resultados sale cada sede. Lógica pura: la usan la cabecera (servidor) y su prueba.
// ASUME: toda cifra viene de la base (`fn_estado_resultados`, `fn_flujo_caja_real`, `fn_balance_general` + `fn_conciliacion_contable`,
// `fn_balance_por_tienda`, `fn_patrimonio_cambios`). Aquí no se suma plata: se elige la columna de la sede y se escribe la frase.
// Sin dato se dice por qué (principio 9): nunca un cero que no es.

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
export const ESTADOS: readonly { clave: ClaveEstado; ruta: string; formal: string }[] = [
  { clave: "ganamos", ruta: "/finanzas/reportes", formal: "Ganancias y pérdidas" },
  { clave: "plata", ruta: "/finanzas/reportes/flujo", formal: "Flujo de efectivo" },
  { clave: "vale", ruta: "/finanzas/reportes/balance", formal: "Balance general" },
  { clave: "tuyo", ruta: "/finanzas/reportes/patrimonio", formal: "Cambios en el patrimonio" },
];

/** ¿La cabecera debe decir «Todas las sedes»? Flujo y Patrimonio son de CAYLA entera, y «Empresa» no tiene Balance aparte: es el de toda CAYLA (tarea 58). Ganancias sí tiene su columna. */
export const esDeTodaCaylaEnLaCabecera = (pantalla: string, sede: ClaveSede): boolean => pantalla === "plata" || pantalla === "tuyo" || (pantalla === "vale" && sede === SEDE_EMPRESA);

/** La columna del Estado de resultados que corresponde a la sede de la barra: todas → CAYLA (el consolidado), empresa → «De la empresa». */
export function filaDeLaSede(filas: readonly FilaER[], sede: ClaveSede): FilaER | null {
  if (sede === SEDE_TODAS) return filas.find((f) => f.unidad === "consolidado") ?? (filas.length === 1 ? filas[0]! : null);
  if (sede === SEDE_EMPRESA) return filas.find((f) => f.unidad === "empresa") ?? null;
  return filas.find((f) => f.ubicacionId === sede) ?? null;
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
