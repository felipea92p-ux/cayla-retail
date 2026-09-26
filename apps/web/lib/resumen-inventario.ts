import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { exigir, type Tolerado } from "@/lib/resultado";
import { getConteosResumen } from "@/lib/conteos";
import { exactitudConteos } from "@/lib/conteo-varianza";
import type { Ubicacion as UbicacionApp } from "@/lib/ubicaciones";
import { DIAS_RITMO_RECIENTE } from "@/lib/inventario-reglas";
import { mapearFila, type FilaCruda } from "@/lib/resumen-mapeo";
import { hoyEnLima, sumarDias, type Rango } from "@/lib/resumen-periodo";
import type { ParametrosResumen } from "@/lib/resumen-armado";
import { armarComparacion, mapearFilaComparacion, rangosDeLaComparacion, type ComparacionParaPantalla, type FilaComparacion, type FilaCrudaComparacion } from "@/lib/resumen-comparacion";
import { armarDesempeno, mitadesDelDesempeno, type DesempenoParaPantalla } from "@/lib/resumen-desempeno";
import { calcularCobertura, velocidadDeFila, type Cobertura, type FilaResumen } from "@/lib/resumen-reglas";

// Análisis de inventario: la parte que LEE de Postgres (ADR-0101, ADR-0121, ADR-0138). Todo lo que
// decide qué significan los números vive en `resumen-reglas.ts`, `resumen-comparacion.ts` y
// `resumen-desempeno.ts` (puros, sin base de datos). Fuentes:
//   - `retail.fn_resumen_comparacion(...)`: por variante, para DOS rangos, lo vendido, las entradas,
//     el stock al inicio y al cierre reconstruido del ledger y los días con stock. La usan las dos
//     pantallas del análisis: Comparar períodos (A y B) y Desempeño (1.ª y 2.ª mitad del período).
//   - `retail.fn_resumen_variantes(...)`: el ritmo reciente de una sede junto al stock de HOY — solo
//     para la cobertura de Existencias.
//   - Conteo: la exactitud es EXACTAMENTE la que muestra la pestaña Conteo.

export type { ComparacionParaPantalla, DesempenoParaPantalla, ParametrosResumen };

/** Una sede ya pasa de 1.000 variantes (TRU ~1.200) y PostgREST corta toda tabla en 1.000 filas. Pedirla por
 *  páginas recalculaba la función ENTERA en cada página (~265 ms de CPU de la base cada vez, medido 2026-09-23):
 *  `fn_resumen_variantes_json` (20260923171700) devuelve las mismas filas en UN valor jsonb — un solo cálculo.
 *
 *  `cache` (React, por pedido) con argumentos PRIMITIVOS: Existencias pide la ventana de 30 días dos veces
 *  (cobertura y recomendaciones) y la base la calcula una sola. */
const getFilasVariantes = cache(async function getFilasVariantes(
  ubicacionId: string,
  desde: string,
  hasta: string,
  cmpDesde?: string,
  cmpHasta?: string,
): Promise<FilaResumen[]> {
  const supabase = await createClient();
  // Los parámetros van escritos EN la llamada (no en una variable ni con «...») para que
  // `pnpm datos:comparar` pueda contrastarlos con la firma real de producción. Sin comparación,
  // `undefined` no viaja en el JSON y la función usa su default (no calcula la ventana comparada).
  const filas = exigir(
    await supabase.rpc("fn_resumen_variantes_json", {
      p_ubicacion_id: ubicacionId,
      p_desde: desde,
      p_hasta: hasta,
      p_cmp_desde: cmpDesde,
      p_cmp_hasta: cmpHasta,
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
 *  y `ventas`/`devoluciones` son la semana, para «Ritmo de venta (7D)» y el delta de «Disponible total».
 *  Trae también `costo`/`precio`/`categoria` de una sola pasada: no hace falta otra llamada para
 *  valorar el stock. */
export async function getFilasSemanaDeSede(ubicacionId: string, ahora: Date = new Date()): Promise<FilaResumen[]> {
  const hoy = hoyEnLima(ahora);
  return getFilasVariantes(ubicacionId, sumarDias(hoy, -6), hoy);
}

/**
 * Cobertura de Existencias: «con el ritmo de venta de los últimos `DIAS_RITMO_RECIENTE` días, ¿cuántos
 * días dura el stock de hoy?». Es la MISMA cuenta que ya hacía el Resumen (`velocidadDeFila` +
 * `calcularCobertura`: unidades netas ÷ días CON stock, y stock utilizable ÷ ese ritmo); aquí solo se
 * trae por variante para pintarla junto al stock.
 *
 * Es un dato SECUNDARIO de Existencias: si falla, la pantalla sigue viva con «N/D» y un aviso, en
 * vez de tumbar el inventario que la encargada usa en el mostrador (ver `lib/resultado.ts`).
 */
export async function getCoberturaPorVariante(ubicacionId: string, ahora: Date = new Date()): Promise<Tolerado<Record<string, Cobertura>>> {
  try {
    const filas = await getFilasRecientesDeSede(ubicacionId, ahora);
    const porVariante: Record<string, Cobertura> = {};
    for (const f of filas) porVariante[f.varianteId] = calcularCobertura(f.utilizable, velocidadDeFila(f));
    return { datos: porVariante, fallo: null };
  } catch {
    return { datos: null, fallo: "No se pudo calcular la cobertura. Lo demás de esta pantalla sí está al día." };
  }
}

// Análisis sobre dos rangos (ADR-0138). La RPC `fn_resumen_comparacion` trae por variante lo vendido, las
// entradas y el stock al inicio y al cierre de A y de B; los parámetros van escritos EN la llamada (no en
// una variable) por la misma razón que arriba: `pnpm datos:comparar` los contrasta con la firma de producción.
async function getFilasComparacion(ubicacionId: string, a: Rango, b: Rango): Promise<FilaComparacion[]> {
  const supabase = await createClient();
  // En una fila jsonb (20260923171700): un solo cálculo, sin el tope de 1.000 filas.
  const filas = exigir(
    await supabase.rpc("fn_resumen_comparacion_json", {
      p_ubicacion_id: ubicacionId,
      p_a_desde: a.desde,
      p_a_hasta: a.hasta,
      p_b_desde: b.desde,
      p_b_hasta: b.hasta,
    }),
    "el análisis del inventario",
  ) as unknown as FilaCrudaComparacion[];
  return filas.map(mapearFilaComparacion);
}

async function getExactitud(ubicacionId: string) {
  const conteos = await getConteosResumen(ubicacionId);
  const cerrado = conteos.find((c) => c.estado === "cerrado" && c.cerradoEn);
  return { exactitud: exactitudConteos(conteos), ultimoCerradoEn: cerrado?.cerradoEn ?? null };
}

export async function getComparacionInventario(ubicacion: UbicacionApp, params: ParametrosResumen, ahora: Date = new Date()): Promise<ComparacionParaPantalla> {
  const { rangoA, periodoB } = rangosDeLaComparacion(params, ahora);

  const [filas, conteos] = await Promise.all([
    getFilasComparacion(ubicacion.id, rangoA, { desde: periodoB.desde, hasta: periodoB.hasta }),
    getExactitud(ubicacion.id),
  ]);

  return armarComparacion({ filas, ubicacion: { id: ubicacion.id, nombre: ubicacion.nombre, tipo: ubicacion.tipo }, params, ahora, conteos });
}

/** Desempeño: el período elegido partido en dos mitades (A = 1.ª, B = 2.ª) para pedirle a la misma RPC el
 *  período entero (sumando las dos), el stock al inicio (el de A) y al cierre (el de B) y la tendencia. */
export async function getDesempenoInventario(ubicacion: UbicacionApp, params: ParametrosResumen, ahora: Date = new Date()): Promise<DesempenoParaPantalla> {
  const { mitades } = mitadesDelDesempeno(params, ahora);

  const [filas, conteos] = await Promise.all([getFilasComparacion(ubicacion.id, mitades.primera, mitades.segunda), getExactitud(ubicacion.id)]);

  return armarDesempeno({ filas, ubicacion: { id: ubicacion.id, nombre: ubicacion.nombre, tipo: ubicacion.tipo }, params, ahora, conteos });
}
