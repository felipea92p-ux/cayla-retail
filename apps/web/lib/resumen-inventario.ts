import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { DIAS_RITMO_RECIENTE } from "@/lib/inventario-reglas";
import { mapearFila, type FilaCruda } from "@/lib/resumen-mapeo";
import { hoyEnLima, sumarDias } from "@/lib/resumen-periodo";
import { mesEnCursoDe } from "@/lib/existencias-resumen";
import { type FilaResumen } from "@/lib/resumen-reglas";

// El ritmo y el stock de cada variante de una sede, leídos de Postgres (ADR-0101, ADR-0121). Lo que decide
// qué significan los números vive en `resumen-reglas.ts` (puro, sin base de datos). Una sola fuente,
// `retail.fn_resumen_variantes_json(...)`: lo vendido en una ventana junto al stock de HOY. La leen
// Existencias (la cobertura, la semana y el mes en curso), «Nueva orden» de Producción y el Observatorio.
// Las lecturas del Análisis de antes de la v4 (Desempeño y Comparar períodos con
// `fn_resumen_comparacion_json`, y la exactitud de Conteo) se borraron con él (2026-10-06).

/** Una sede ya pasa de 1.000 variantes (TRU ~1.200) y PostgREST corta toda tabla en 1.000 filas. Pedirla por
 *  páginas recalculaba la función ENTERA en cada página (~265 ms de CPU de la base cada vez, medido 2026-09-23):
 *  `fn_resumen_variantes_json` (20260923171700) devuelve las mismas filas en UN valor jsonb — un solo cálculo.
 *
 *  `cache` (React, por pedido) con argumentos PRIMITIVOS: Existencias pide la ventana de 30 días dos veces
 *  (cobertura y recomendaciones) y la base la calcula una sola. */
const getFilasVariantes = cache(async function getFilasVariantes(ubicacionId: string, desde: string, hasta: string): Promise<FilaResumen[]> {
  const supabase = await createClient();
  // Los parámetros van escritos EN la llamada (no en una variable ni con «...») para que
  // `pnpm datos:comparar` pueda contrastarlos con la firma real de producción. Sin `p_cmp_desde` ni
  // `p_cmp_hasta` la función usa su default y no calcula la ventana comparada: la pedía solo el
  // Análisis de antes de la v4.
  const filas = exigir(
    await supabase.rpc("fn_resumen_variantes_json", {
      p_ubicacion_id: ubicacionId,
      p_desde: desde,
      p_hasta: hasta,
    }),
    "el ritmo de venta reciente",
  ) as unknown as FilaCruda[];
  return filas.map(mapearFila);
});

/** El ritmo de venta reciente (`DIAS_RITMO_RECIENTE` días) y el stock de HOY de todas las variantes de una sede, tal como las lee Existencias. Lo usa
 *  también «Nueva orden» de Producción (ADR-0133, F5) para sumar la demanda de la red. */
export async function getFilasRecientesDeSede(ubicacionId: string, ahora: Date = new Date()): Promise<FilaResumen[]> {
  const hoy = hoyEnLima(ahora);
  return getFilasVariantes(ubicacionId, sumarDias(hoy, -(DIAS_RITMO_RECIENTE - 1)), hoy);
}

/** Los últimos 7 días de una sede (2026-09-22, rediseño de Existencias): mismo dato que
 *  `getFilasRecientesDeSede`, ventana corta — `stockInicial` de esta fila es el stock de hace 7 días,
 *  y `ventas`/`devoluciones` son la semana, para el delta de «Disponible total» y su desglose.
 *  Trae también `costo`/`precio`/`categoria` de una sola pasada: no hace falta otra llamada para
 *  valorar el stock. */
export async function getFilasSemanaDeSede(ubicacionId: string, ahora: Date = new Date()): Promise<FilaResumen[]> {
  const hoy = hoyEnLima(ahora);
  return getFilasVariantes(ubicacionId, sumarDias(hoy, -6), hoy);
}

/** Lo vendido en el MES EN CURSO de todas las prendas de una sede (hora de Lima): «Resumen disponible» de Existencias. La misma lectura
 *  que `getFilasSemanaDeSede`, con otra ventana: arranca el día 1, así que el contador vuelve a cero solo cuando empieza el mes
 *  (`mesEnCurso`). Se pide al abrir la ventana (`/api/existencias/ventas-del-mes`), no al cargar Existencias. */
export async function getVentasDelMesDeSede(ubicacionId: string, ahora: Date = new Date()): Promise<FilaResumen[]> {
  const { desde, hasta } = mesEnCursoDe(ahora);
  return getFilasVariantes(ubicacionId, desde, hasta);
}
