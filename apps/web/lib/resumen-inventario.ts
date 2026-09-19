import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getConteosResumen } from "@/lib/conteos";
import { exactitudConteos } from "@/lib/conteo-varianza";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import type { Ubicacion as UbicacionApp } from "@/lib/ubicaciones";
import { mapearFila, type FilaCruda } from "@/lib/resumen-mapeo";
import type { Rango } from "@/lib/resumen-periodo";
import { armarResumen, rangosDelResumen, type ParametrosResumen, type ResumenParaPantalla } from "@/lib/resumen-armado";
import type { FilaResumen } from "@/lib/resumen-reglas";

// Resumen de Inventario (ADR-0101, v2 en ADR-0113): la parte que LEE de Postgres.
// Todo lo que decide qué significan los números vive en `resumen-reglas.ts` y el
// armado de la pantalla en `resumen-armado.ts` (puros, sin base de datos). Fuentes:
//   - `retail.fn_resumen_variantes(...)`: números crudos por variante para el
//     período elegido (y el de comparación), para esa sede y las otras.
//   - Conteo: la exactitud es EXACTAMENTE la que muestra la pestaña Conteo.
//
// REGLA FUNDAMENTAL: el período mueve las métricas históricas; el stock es
// siempre el de AHORA. Por eso la RPC recibe fechas pero el stock lo lee de
// `stock` sin filtro alguno.

export type { ParametrosResumen, ResumenParaPantalla };

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
      "el resumen de inventario",
    );
    for (const f of pagina) filas.push(mapearFila(f as unknown as FilaCruda));
    if (pagina.length < PAGINA_RPC) break;
  }
  return filas;
}

export async function getResumenInventario(ubicacion: UbicacionApp, params: ParametrosResumen, ahora: Date = new Date()): Promise<ResumenParaPantalla> {
  const { periodo, comparacion } = rangosDelResumen(params, ahora);

  const [filas, conteos, sububicaciones] = await Promise.all([
    getFilasVariantes(ubicacion.id, periodo, comparacion),
    getConteosResumen(ubicacion.id),
    getSububicaciones(ubicacion.id),
  ]);

  const cerrado = conteos.find((c) => c.estado === "cerrado" && c.cerradoEn);
  return armarResumen({
    filas,
    ubicacion: { id: ubicacion.id, nombre: ubicacion.nombre, tipo: ubicacion.tipo },
    params,
    ahora,
    conteos: { exactitud: exactitudConteos(conteos), ultimoCerradoEn: cerrado?.cerradoEn ?? null },
    sububicaciones: {
      pisoId: encontrarPorTipo(sububicaciones, "piso_venta")?.id ?? null,
      almacenId: encontrarPorTipo(sububicaciones, "almacen_tienda")?.id ?? null,
    },
  });
}
