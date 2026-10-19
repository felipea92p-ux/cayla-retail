// Los beneficios de aniversario del club como los entrega `fn_club_pagina` (ADR-0288, G-13): el % del cumpleaños, cuándo cuenta un año y el
// vale de cada año. Lógica pura. Desde el programa de puntos (actividad 8) la hoja que los editaba se fue (la reemplaza Clientes ▸
// Beneficios del club, `club-puntos-config-reglas.ts`); esto queda SOLO para el cartel del mostrador (`club-cartel-reglas.ts`) hasta que
// la actividad 11 lo reescriba con los puntos.
//
// CONTRATO
//   PROMETE: leer los beneficios vigentes de lo que devuelve `fn_club_pagina` (o decir que no se pudo).
//   NO HACE: no los edita ni decide nada: los límites los cuida la base.

/** Años de la escala del vale de aniversario: del 1 al 5; el del quinto se repite los años siguientes (G-13). */
export const ANIOS_ESCALA = 5;

export type BeneficiosClub = {
  /** % de descuento del cupón de cumpleaños (`configuracion_empresa.club_cumple_pct`). */
  pct: number;
  /** Compras netas en el año de club para que el año cuente (`club_aniversario_compras`). */
  compras: number;
  /** O este monto en soles de compras netas en el año (`club_aniversario_monto`). */
  monto: number;
  /** Días que tiene para usar el vale (`club_aniversario_dias`). */
  dias: number;
  /** El vale en soles de cada año, del 1 al 5 (`club_aniversario_escala`). */
  escala: number[];
};

const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Los beneficios vigentes desde el jsonb de `fn_club_pagina`, o null si no vienen completos (una base sin la tanda 1g, o sin la escala
 *  de los cinco años): el modal no inventa valores que después guardaría encima de los reales. */
export function leerBeneficios(pagina: unknown): BeneficiosClub | null {
  if (!pagina || typeof pagina !== "object") return null;
  const p = pagina as Record<string, unknown>;
  const pct = numero(p.pct);
  const compras = numero(p.compras);
  const monto = numero(p.monto_minimo);
  const dias = numero(p.dias);
  if (pct === null || compras === null || monto === null || dias === null || !Array.isArray(p.escala)) return null;
  const porAnio = new Map<number, number>();
  for (const e of p.escala as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const anio = numero((e as Record<string, unknown>).anio);
    const valor = numero((e as Record<string, unknown>).monto);
    if (anio !== null && valor !== null) porAnio.set(anio, valor);
  }
  const escala = Array.from({ length: ANIOS_ESCALA }, (_, i) => porAnio.get(i + 1));
  if (escala.some((v) => v === undefined)) return null;
  return { pct, compras, monto, dias, escala: escala as number[] };
}
