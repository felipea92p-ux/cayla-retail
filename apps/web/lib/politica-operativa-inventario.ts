/* ====================================================================
   politica-operativa-inventario.ts · Política operativa de Inventario (Felipe, 2026-09-25)

   Fuente ÚNICA de los parámetros operativos de Existencias que NO son del piso — hoy uno solo:
   - `minDiasExposicionRitmo` (3 jornadas completas): antes de esto, «Ritmo reciente» no se
     calcula — se muestran los hechos crudos (`existencias-ritmo.ts`).

   LO QUE YA NO VIVE AQUÍ (ADR-0328 act. 7, 2026-10-04): `umbralStockPisoReposicion` (piso ≤ 4 → «Reponer a piso») se retiró.
   Con esa regla Tienda TRU marcaba «Reponer» en sus 510 tallas de 510 (ninguna tiene más de 4 colgadas), así que nunca podía
   decir «Mantener». Lo que el piso pide hoy lo decide UN motor, `lib/piso-plan.ts` (mínimo de 1 por talla y color en las tallas
   centrales, lo vendido ayer primero, la pausa sin cuadre), y `lib/piso-plan-umbral.test.ts` falla si alguien vuelve a escribir
   un umbral de piso fuera de ese archivo — también aquí.

   NO traigas acá un número heredado (`UMBRAL_REPOSICION_PISO=7`, `DIAS_OBJETIVO_PISO=7`, el fallback de 8 unidades del motor de
   Análisis, etc.) sin que Felipe lo apruebe conscientemente PARA Existencias: estaban afinados para la ventana de Análisis, no
   para esta, y se borraron con el Análisis de antes de la v4 (2026-10-06).
   ==================================================================== */

export type PoliticaOperativaInventario = {
  /** Jornadas completas de exposición comercial mínimas para calcular un Ritmo reciente
   *  confiable (`existencias-ritmo.ts`, `RitmoReciente.tipo === "insuficiente"` con menos). */
  minDiasExposicionRitmo: number;
};

const DEFAULT: PoliticaOperativaInventario = {
  minDiasExposicionRitmo: 3,
};

/**
 * Overrides por sede (`ubicacion_id` → solo los campos que esa sede cambia; el resto lo hereda de `DEFAULT`). VACÍO A PROPÓSITO
 * (2026-09-25, decisión de Felipe): "no inventes ahora valores distintos por tienda" — hoy TODAS heredan el default sin
 * excepción. Para darle a una sede su propio número el día que haga falta, se agrega UNA línea acá y `politicaDe` la aplica sola.
 */
const OVERRIDES_POR_SEDE: Readonly<Record<string, Partial<PoliticaOperativaInventario>>> = {};

/** El merge en sí, separado de `politicaDe` para poder probarlo con un override de prueba sin
 *  depender del contenido (hoy vacío) de `OVERRIDES_POR_SEDE` — ver `politica-operativa-inventario.test.ts`. */
export function resolverPolitica(override: Partial<PoliticaOperativaInventario> | undefined): PoliticaOperativaInventario {
  return { ...DEFAULT, ...override };
}

/** Punto único de lectura de la política operativa de una sede — el resto del dominio de
 *  Existencias nunca lee `DEFAULT`/`OVERRIDES_POR_SEDE` directamente. */
export function politicaDe(sedeId: string): PoliticaOperativaInventario {
  return resolverPolitica(OVERRIDES_POR_SEDE[sedeId]);
}
