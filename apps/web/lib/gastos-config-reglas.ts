// Configuración ▸ Gastos (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): junta Gastos fijos, Presupuesto y Reparto CLAURE. Lógica pura.
//
// Contrato — PROMETE: ubicar cada fijo en la línea del mes, agruparlos por unidad y decir si un mes ya tiene topes. ASUME: `fechaEsperada` la calcula la base (ya resuelve la
// quincena y el fin de mes). NO decide cuánto se paga ni cuánto se reparte: eso sigue en `validarFijo`, `parsearTope` y `validarPct`.

import { colorDeSede, nombreCortoSede, type ColorSede } from "./finanzas-telar-reglas";
import type { GastoFijoMes } from "./gastos-reglas";
import type { ConfigPpto } from "./presupuesto-reglas";

export const UNIDAD_EMPRESA = "empresa";

type FijoDeLaLinea = Pick<GastoFijoMes, "id" | "descripcion" | "monto" | "fechaEsperada">;

export const claveUnidad = (f: Pick<GastoFijoMes, "ubicacionId">) => f.ubicacionId ?? UNIDAD_EMPRESA;

/** Las unidades que tienen fijos, para filtrar: primero las sedes, en el orden en que llegan, y la empresa al final. */
export function unidadesDeFijos(fijos: readonly Pick<GastoFijoMes, "ubicacionId" | "ubicacionNombre">[]): { clave: string; nombre: string }[] {
  const sedes = new Map(fijos.filter((f) => f.ubicacionId).map((f) => [f.ubicacionId as string, nombreCortoSede(f.ubicacionNombre)]));
  return [...[...sedes].map(([clave, nombre]) => ({ clave, nombre })), ...(fijos.some((f) => !f.ubicacionId) ? [{ clave: UNIDAD_EMPRESA, nombre: "Empresa" }] : [])];
}

/** El color de la unidad de un fijo. La empresa no es una sede: va en taupe. */
export function colorDeFijo(f: Pick<GastoFijoMes, "ubicacionId" | "ubicacionNombre">): ColorSede {
  if (!f.ubicacionId) return "emp";
  return colorDeSede({ nombre: f.ubicacionNombre, tipo: /taller/i.test(f.ubicacionNombre) ? "taller" : "tienda" });
}

/** El día del mes en que vence («2026-11-15» → 15). */
export const diaDelFijo = (f: Pick<GastoFijoMes, "fechaEsperada">) => Number(f.fechaEsperada.slice(8, 10));

/** Cuántos días tiene el mes de una fecha «AAAA-MM-DD». */
export function diasDelMes(fecha: string): number {
  return new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)), 0)).getUTCDate();
}

/** Cada fijo en la línea del mes: `x` de 0 a 1 (día 1 a último día) y `piso`, cuántos ya vencen ese mismo día (se apilan para no taparse). */
export function pagosEnLaLinea<F extends FijoDeLaLinea>(fijos: readonly F[], ultimoDia: number): (F & { dia: number; x: number; piso: number })[] {
  const pisos = new Map<number, number>();
  return [...fijos]
    .sort((a, b) => diaDelFijo(a) - diaDelFijo(b))
    .map((f) => {
      const dia = diaDelFijo(f);
      const piso = pisos.get(dia) ?? 0;
      pisos.set(dia, piso + 1);
      return { ...f, dia, piso, x: Math.min(1, Math.max(0, (dia - 1) / Math.max(1, ultimoDia - 1))) };
    });
}

/** Hasta dónde va el mes, de 0 a 1. */
export function avanceDelMes(hoy: string): number {
  return Math.min(1, Math.max(0, (Number(hoy.slice(8, 10)) - 1) / Math.max(1, diasDelMes(hoy) - 1)));
}

/** ¿Este mes ya tiene algún tope? Si no, lo primero es partir de algo en vez de doce casillas vacías. */
export const mesConTopes = (d: Pick<ConfigPpto, "montos">) => Object.keys(d.montos).length > 0;
