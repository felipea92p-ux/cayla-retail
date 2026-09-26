/* ====================================================================
   politica-operativa-inventario.ts · Política operativa de Inventario (Felipe, 2026-09-25)

   Fuente ÚNICA de los umbrales que gobiernan decisiones operativas de Existencias — KPI,
   tabla, filtro y el motor de «Acción hoy» leen de ACÁ, nunca de un número escrito aparte.
   Nace de un problema real: el dominio anterior afinó `UMBRAL_REPOSICION_PISO=7` para un
   ritmo de 30 días (`inventario-reglas.ts`) y ese mismo «7» se filtró, sin validar, a
   comparaciones contra un ritmo de 7 días — exactamente la clase de «ventana que ya no
   corresponde» que este archivo existe para impedir.

   Reglas aprobadas hasta hoy:
   - `minDiasExposicionRitmo` (3 jornadas completas): antes de esto, «Ritmo reciente» no se
     calcula — se muestran los hechos crudos (`existencias-ritmo.ts`).
   - `umbralStockPisoReposicion` (4 unidades — Felipe, tercera ronda 2026-09-25): REGLA FÍSICA
     DE PISO, no una estimación de demanda. `stock_piso <= umbralStockPisoReposicion` es SIEMPRE
     «Reponer a piso», incluido el propio 4, sin importar Ritmo reciente, Cobertura piso ni
     jornadas de exposición — con pocas prendas físicamente en el piso, la vendedora debe
     revisar y reponer aunque la cobertura calculada «parezca» aceptable. Responde SOLO
     «¿necesita algo hoy?», nunca «¿cuántas unidades?» — esa política de cantidad todavía no
     existe (BACKLOG). Reemplaza a `umbralReposicionPisoDias` (2 días de Cobertura piso), que
     existió un día y se retiró: Cobertura piso ya NO dispara reposición, solo informa cuánto
     dura aproximadamente el piso de hoy (`existencias-ritmo.ts`).

   NO migres acá un número heredado (`UMBRAL_REPOSICION_PISO=7`, `DIAS_OBJETIVO_PISO=7`, el
   fallback de 8 unidades del motor de Análisis, etc.) sin que Felipe lo apruebe
   conscientemente PARA Existencias — esos siguen donde están, afinados para SU propia
   ventana, no para esta.
   ==================================================================== */

export type PoliticaOperativaInventario = {
  /** Jornadas completas de exposición comercial mínimas para calcular un Ritmo reciente
   *  confiable (`existencias-ritmo.ts`, `RitmoReciente.tipo === "insuficiente"` con menos). */
  minDiasExposicionRitmo: number;
  /** Unidades en PISO en o por debajo de las cuales una variante necesita «Reponer a piso» HOY
   *  — regla física, no depende de Ritmo reciente ni de Cobertura piso (`existencias-recomendaciones.ts`). */
  umbralStockPisoReposicion: number;
};

const DEFAULT: PoliticaOperativaInventario = {
  minDiasExposicionRitmo: 3,
  umbralStockPisoReposicion: 4,
};

/**
 * Overrides por sede (`ubicacion_id` → solo los campos que esa sede cambia; el resto lo
 * hereda de `DEFAULT`). VACÍO A PROPÓSITO (2026-09-25, decisión de Felipe): "no inventes ahora
 * valores distintos por tienda" — hoy TODAS heredan el default sin excepción. Para darle a una
 * sede su propio número el día que haga falta (ej. LIM con 5 unidades en vez de 4), se agrega
 * UNA línea acá:
 *
 *   "<ubicacion_id-de-LIM>": { umbralStockPisoReposicion: 5 },
 *
 * y `politicaDe` la aplica sola — ningún consumidor (KPI, tabla, filtro, motor de Acción hoy)
 * cambia una línea.
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
