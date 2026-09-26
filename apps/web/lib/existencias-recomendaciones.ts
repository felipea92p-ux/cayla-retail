import type { PoliticaOperativaInventario } from "./politica-operativa-inventario";

/* ====================================================================
   existencias-recomendaciones · «Acción hoy» y «Ver recomendaciones»
   (2026-09-22, rehecho 2026-09-25 ×4 — última vez: solo 2 tipos, sin `planDeReposicion`)

   POR QUÉ YA NO SE APOYA EN `planDeReposicion` (`resumen-reglas.ts`): ese motor lo usan
   Análisis (`resumen-armado.ts` → `analizarSede`) y, hasta el 2026-09-25, Existencias. Sus
   fórmulas de cantidad están afinadas para el ritmo de 30 días de Análisis. Existencias tiene su
   propio motor, `calcularAccionHoy`, sobre lo que YA sabe de una prenda (piso, almacén, en
   camino — `FilaStock`/`FilaExistencias`). `resumen-reglas.ts` sigue exactamente igual para
   Análisis: no se tocó una línea.

   LA REGLA CANÓNICA (Felipe, cuarta ronda, 2026-09-25) — REGLA FÍSICA DE PISO, no estimación de
   demanda, y AHORA TOTALMENTE INDEPENDIENTE de Ritmo reciente/Cobertura piso:

     stock_piso <= politica.umbralStockPisoReposicion  →  «Reponer a piso»
     stock_piso >  politica.umbralStockPisoReposicion  →  «Sin acción»

   Por eso `calcularAccionHoy` NO recibe ni `RitmoReciente` ni `CoberturaPiso` como parámetro —
   directamente no le hacen falta para decidir nada, ni siquiera para el caso «RPC caída»: el
   piso siempre se conoce (viene de `stock`, no de la RPC de ritmo), así que la función nunca
   devuelve N/D — SIEMPRE hay una `AccionHoy` para cada fila con piso/almacén separados.

   «BASE INSUFICIENTE» SE RETIRÓ POR COMPLETO (2026-09-25, cuarta ronda): existió un rato como
   tercer tipo de `TipoAccionHoy` para «piso > umbral, menos de `minDiasExposicionRitmo` jornadas»
   — pero, una vez que la reposición dejó de depender del ritmo, esa combinación ya no significa
   nada para Acción hoy: es un dato sobre la CALIDAD del Ritmo reciente/Cobertura piso (que
   siguen mostrando sus propios estados «insuficiente»/N/D, sin cambios, en sus propias columnas),
   no sobre qué hacer hoy con el piso. Con piso > umbral la respuesta es «Sin acción» tenga 0, 1,
   2 o 30 jornadas de exposición — `minDiasExposicionRitmo` y `umbralStockPisoReposicion` son dos
   políticas independientes: la primera gobierna Ritmo/Cobertura, la segunda gobierna Acción hoy,
   y no se cruzan.

   QUÉ RESPONDE Y QUÉ NO: «Acción hoy» dice SOLO qué hacer (Reponer a piso / Sin acción) — nunca
   cuántas unidades. Decisión de Felipe (2026-09-25, cuarta ronda, ya no pendiente): CAYLA NO
   sugiere cantidad a reponer — la vendedora decide cuánto bajar del almacén al piso. Esto queda
   fuera del modelo actual, no es un TODO. «Esperar llegada»/«Revisar abastecimiento» tampoco son
   tipos: cuando el piso necesita reposición pero el almacén está en 0, la acción SIGUE siendo
   «Reponer a piso» — lo que cambia es el CONTEXTO (`AccionHoy.contexto`): «Sin stock en
   almacén», o «Sin stock en almacén · N uds en camino». Nunca reemplaza la acción principal.

   UNA SOLA FUENTE DE VERDAD: `calcularAccionHoy` es la ÚNICA función que decide si una prenda
   necesita algo hoy. La tarjeta «Reponer a piso hoy», la columna de la tabla, el filtro «Acción»,
   el botón inline «Reponer» y «Ver recomendaciones» leen TODOS del mismo `Map<string, AccionHoy>`
   que arma `accionHoyPorVariante`.
   ==================================================================== */

/** Lo mínimo de una fila de Existencias que el motor necesita para decidir — deliberadamente
 *  desacoplado de `FilaExistencias` (`inventario-v2.ts`, servidor): este archivo es puro, sin
 *  Supabase, y una `FilaExistencias` real satisface esta forma sin conversión (tipado
 *  estructural), así que `page.tsx` pasa su `stock` tal cual. */
export type FilaParaAccionHoy = {
  varianteId: string;
  /** `null` = ubicación que no separa piso de almacén (Taller): no vende a clientas, sin acción. */
  pisoDisponible: number | null;
  almacenDisponible: number | null;
  /** Unidades ya confirmadas viniendo hacia esta sede, todavía no recibidas (`FilaExistencias.enTransito`). */
  enTransito: number;
};

/** Lo que además necesita «Ver recomendaciones» para dibujar cada fila — mismo criterio: una
 *  `FilaExistencias` real ya tiene estos campos, sin necesidad de mapear nada. */
export type FilaParaRecomendaciones = FilaParaAccionHoy & {
  referencia: string;
  sku: string;
  talla: string | null;
  fotoUrl: string | null;
  colorHex: string | null;
};

export type TipoAccionHoy = "reponer_a_piso" | "sin_accion";

export const TEXTO_ACCION_HOY: Record<TipoAccionHoy, string> = {
  reponer_a_piso: "Reponer a piso",
  sin_accion: "Sin acción",
};

/** Orden de urgencia para la tabla y el filtro: lo que pide acción primero. */
export const ORDEN_ACCION_HOY: Record<TipoAccionHoy, number> = {
  reponer_a_piso: 0,
  sin_accion: 1,
};

export type AccionHoy = {
  tipo: TipoAccionHoy;
  texto: string;
  /** Una línea explicando POR QUÉ, para «Ver recomendaciones» — null en «Sin acción» (no hace
   *  falta explicar por qué algo que está bien, está bien). */
  motivo: string | null;
  /** Nota corta junto al chip de la tabla — «Sin stock en almacén», «Sin stock en almacén · 8
   *  uds en camino» — NUNCA reemplaza `tipo`/`texto`: la necesidad del piso sigue siendo
   *  «Reponer a piso» aunque no haya de dónde bajarlo hoy mismo. Null cuando no hace falta
   *  aclarar nada (hay almacén, o la fila no es «Reponer a piso»). */
  contexto: string | null;
};

function accion(tipo: TipoAccionHoy, motivo: string | null, contexto: string | null = null): AccionHoy {
  return { tipo, texto: TEXTO_ACCION_HOY[tipo], motivo, contexto };
}

const SIN_ACCION = accion("sin_accion", null);

/** Piso <= umbral, con o sin almacén/en camino: la acción SIEMPRE es «Reponer a piso» — lo único
 *  que cambia es el contexto. Nunca «Esperar llegada»/«Revisar abastecimiento» como acción
 *  principal: esos matices son contexto, no un tipo de Acción hoy aparte (Felipe, 2026-09-25). */
function reponerAPiso(piso: number, almacen: number, enTransito: number, umbral: number): AccionHoy {
  if (almacen > 0) {
    return accion("reponer_a_piso", `Piso en ${piso} — regla de piso: reponer con ${umbral} o menos, y hay ${almacen} ${almacen === 1 ? "unidad disponible" : "unidades disponibles"} en el almacén de la tienda`);
  }
  if (enTransito > 0) {
    return accion(
      "reponer_a_piso",
      `Piso en ${piso} y el almacén de la tienda está en 0 — hay ${enTransito} ${enTransito === 1 ? "unidad" : "unidades"} en camino, pero la reposición de piso sigue pendiente hasta que lleguen`,
      `Sin stock en almacén · ${enTransito} ${enTransito === 1 ? "ud" : "uds"} en camino`
    );
  }
  return accion(
    "reponer_a_piso",
    `Piso en ${piso} y el almacén de la tienda también está en 0 — conviene revisar abastecimiento además de reponer en cuanto haya stock`,
    "Sin stock en almacén"
  );
}

/** El motor único de «Acción hoy» (rehecho 2026-09-25, cuarta ronda): SOLO mira piso/almacén/en
 *  camino — nunca Ritmo reciente ni Cobertura piso, ni para decidir ni para el caso «RPC caída»
 *  (el piso siempre se conoce). Por eso nunca devuelve null: con separación piso/almacén SIEMPRE
 *  hay una `AccionHoy` para la fila. */
export function calcularAccionHoy(f: FilaParaAccionHoy, politica: PoliticaOperativaInventario): AccionHoy {
  if (f.pisoDisponible === null || f.almacenDisponible === null) return SIN_ACCION; // Taller: no vende a clientas

  const piso = f.pisoDisponible;
  if (piso <= politica.umbralStockPisoReposicion) return reponerAPiso(piso, f.almacenDisponible, f.enTransito, politica.umbralStockPisoReposicion);
  return SIN_ACCION; // piso > umbral: sin acción, sea cual sea el Ritmo reciente/Cobertura piso
}

/** «Acción hoy» de cada variante de la sede — la tarjeta, la tabla, el filtro y el botón
 *  inline «Reponer» leen TODOS de este mismo mapa. Siempre tiene una entrada por variante con
 *  piso/almacén separados (nunca N/D: la decisión no depende de una RPC que pueda fallar). */
export function accionHoyPorVariante(filas: readonly FilaParaAccionHoy[], politica: PoliticaOperativaInventario): Map<string, AccionHoy> {
  const mapa = new Map<string, AccionHoy>();
  for (const f of filas) mapa.set(f.varianteId, calcularAccionHoy(f, politica));
  return mapa;
}

export type Recomendacion = { fila: FilaParaRecomendaciones; accion: AccionHoy };

/** «Ver recomendaciones»: solo las variantes que de verdad piden algo hoy — «Reponer a piso» —
 *  ordenadas por urgencia. MISMO mapa que arma la tarjeta «Reponer a piso hoy» y la columna de
 *  la tabla: una sola clasificación de dominio, nunca dos reglas por separado. */
export function recomendacionesDeSede(filas: readonly FilaParaRecomendaciones[], politica: PoliticaOperativaInventario): Recomendacion[] {
  return filas
    .map((f) => ({ fila: f, accion: calcularAccionHoy(f, politica) }))
    .filter((r) => r.accion.tipo === "reponer_a_piso")
    .sort((a, b) => ORDEN_ACCION_HOY[a.accion.tipo] - ORDEN_ACCION_HOY[b.accion.tipo]);
}
