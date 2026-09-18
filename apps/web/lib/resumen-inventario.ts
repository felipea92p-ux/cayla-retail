import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getConteosResumen } from "@/lib/conteos";
import { exactitudConteos } from "@/lib/conteo-varianza";
import type { Ubicacion } from "@/lib/ubicaciones";
import {
  analizarInventario,
  VENTANA_VELOCIDAD_DIAS,
  type FilaVarianteResumen,
  type ResumenAnalitico,
  type UbicacionEnRed,
} from "@/lib/resumen-reglas";

// Resumen de Inventario (2026-09-17, ADR-0097): la pantalla de decisión de una
// sede. Tres fuentes, ninguna inventada acá:
//   - `retail.fn_resumen_variantes(p_ubicacion_id, p_ventana_dias)`: números
//     crudos por variante para esa sede y para las otras (jsonb `en_red`).
//   - `resumen-reglas.ts`: qué significan esos números (única casa de las reglas).
//   - Conteo: la exactitud es EXACTAMENTE la que muestra la pestaña Conteo
//     (`getConteosResumen` + `exactitudConteos`), para que las dos pestañas
//     nunca digan dos porcentajes distintos de la misma sede.

export type ExactitudInventario = ReturnType<typeof exactitudConteos>;

/** Lo que viaja al componente cliente: todo menos `analisis` (una fila por
 *  variante de la sede). Las listas de las tarjetas y la tabla salen de
 *  `decisiones` (solo lo que pide acción), así una sede con miles de variantes
 *  sanas no manda miles de filas al navegador. */
export type ResumenParaPantalla = Omit<ResumenAnalitico, "analisis"> & {
  exactitud: ExactitudInventario;
  ventanaDias: number;
};

type EnRedCrudo = {
  ubicacion_id: string;
  nombre: string;
  tipo: UbicacionEnRed["tipo"];
  separa_piso_almacen: boolean;
  disponible: number;
  almacen: number;
  dias_observables: number | null;
  ventas_ventana: number;
  devoluciones_ventana: number;
  en_camino: number;
};

/** PostgREST corta cualquier respuesta en `max_rows` (1.000 en
 *  supabase/config.toml) SIN error: una sede con más variantes quedaría
 *  analizada a medias en silencio. Se pagina con Range sobre el orden estable
 *  de la RPC (…, variante_id) hasta que una página venga corta. */
const PAGINA = 1000;

async function getFilasVariantes(ubicacionId: string): Promise<FilaVarianteResumen[]> {
  const supabase = await createClient();
  const filas: FilaVarianteResumen[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const pagina = exigir(
      await supabase
        .rpc("fn_resumen_variantes", { p_ubicacion_id: ubicacionId, p_ventana_dias: VENTANA_VELOCIDAD_DIAS })
        .range(desde, desde + PAGINA - 1),
      "el resumen de inventario",
    );
    for (const f of pagina) {
      filas.push({
        varianteId: f.variante_id,
        productoId: f.producto_id,
        referencia: f.referencia,
        categoria: f.categoria_nombre,
        sku: f.sku ?? "",
        codigo: f.codigo,
        talla: f.talla,
        colorCodigo: f.color_codigo,
        color: f.color_nombre,
        colorHex: f.color_hex,
        fotoUrl: f.foto_url,
        stockMinimo: f.stock_minimo,
        separaPisoAlmacen: f.separa_piso_almacen,
        piso: f.piso,
        almacen: f.almacen,
        sinSububicacion: f.sin_sububicacion,
        cuarentena: f.cuarentena,
        disponible: f.disponible,
        primerIngreso: f.primer_ingreso,
        diasObservables: f.dias_observables,
        ventasVentana: f.ventas_ventana,
        devolucionesVentana: f.devoluciones_ventana,
        ultimaVenta: f.ultima_venta,
        entradasVentana: f.entradas_ventana,
        mermasVentana: f.mermas_ventana,
        trasladosSalidaVentana: f.traslados_salida_ventana,
        enCamino: f.en_camino,
        enCaminoATiempo: f.en_camino_a_tiempo,
        enCaminoAtrasado: f.en_camino_atrasado,
        proximaLlegada: f.proxima_llegada,
        enRed: ((f.en_red ?? []) as EnRedCrudo[]).map((o) => ({
          ubicacionId: o.ubicacion_id,
          nombre: o.nombre,
          tipo: o.tipo,
          separaPisoAlmacen: o.separa_piso_almacen,
          disponible: o.disponible,
          almacen: o.almacen,
          diasObservables: o.dias_observables,
          ventasVentana: o.ventas_ventana,
          devolucionesVentana: o.devoluciones_ventana,
          enCamino: o.en_camino,
        })),
      });
    }
    if (pagina.length < PAGINA) break;
  }
  return filas;
}

export async function getResumenInventario(ubicacion: Ubicacion): Promise<ResumenParaPantalla> {
  const [filas, conteos] = await Promise.all([getFilasVariantes(ubicacion.id), getConteosResumen(ubicacion.id)]);
  const { analisis: _analisis, ...analitico } = analizarInventario(filas, {
    id: ubicacion.id,
    nombre: ubicacion.nombre,
    tipo: ubicacion.tipo,
  });
  void _analisis;
  return { ...analitico, exactitud: exactitudConteos(conteos), ventanaDias: VENTANA_VELOCIDAD_DIAS };
}
