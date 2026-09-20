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

/** PostgREST corta cualquier respuesta en `max_rows` (1.000 en
 *  supabase/config.toml) SIN error: una sede con más variantes quedaría
 *  analizada a medias en silencio. Se pagina con Range sobre el orden estable
 *  de la RPC (…, variante_id) hasta que una página venga corta. */
const PAGINA_RPC = 1000;

async function getFilasVariantes(ubicacionId: string, periodo: Rango, comparacion: Rango | null): Promise<FilaResumen[]> {
  const supabase = await createClient();
  const filas: FilaResumen[] = [];
  for (let desde = 0; ; desde += PAGINA_RPC) {
    // Los parámetros van escritos EN la llamada (no en una variable ni con «...»)
    // para que `pnpm datos:comparar` pueda contrastarlos con la firma real de
    // producción. Sin comparación, `undefined` no viaja en el JSON y la función
    // usa su default (no calcula la ventana comparada).
    const pagina = exigir(
      await supabase
        .rpc("fn_resumen_variantes", {
          p_ubicacion_id: ubicacionId,
          p_desde: periodo.desde,
          p_hasta: periodo.hasta,
          p_cmp_desde: comparacion?.desde,
          p_cmp_hasta: comparacion?.hasta,
        })
        .range(desde, desde + PAGINA_RPC - 1),
      "el ritmo de venta reciente",
    );
    for (const f of pagina) filas.push(mapearFila(f as unknown as FilaCruda));
    if (pagina.length < PAGINA_RPC) break;
  }
  return filas;
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
    const hoy = hoyEnLima(ahora);
    const filas = await getFilasVariantes(ubicacionId, { desde: sumarDias(hoy, -(DIAS_RITMO_RECIENTE - 1)), hasta: hoy }, null);
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
  const filas: FilaComparacion[] = [];
  for (let desde = 0; ; desde += PAGINA_RPC) {
    const pagina = exigir(
      await supabase
        .rpc("fn_resumen_comparacion", {
          p_ubicacion_id: ubicacionId,
          p_a_desde: a.desde,
          p_a_hasta: a.hasta,
          p_b_desde: b.desde,
          p_b_hasta: b.hasta,
        })
        .range(desde, desde + PAGINA_RPC - 1),
      "el análisis del inventario",
    );
    for (const f of pagina) filas.push(mapearFilaComparacion(f as unknown as FilaCrudaComparacion));
    if (pagina.length < PAGINA_RPC) break;
  }
  return filas;
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
