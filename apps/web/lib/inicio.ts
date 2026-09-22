import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { listarMovimientos, type Movimiento } from "@/lib/movimientos-v2";
import { ID_CARGO_ESPECIAL, ID_PRODUCTO_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { armarPendientes, primerAviso, sumarUnidades, type PendienteInicio } from "@/lib/inicio-reglas";

/** Contrato: dada una sede, devuelve las tres cifras de catálogo y la actividad reciente.
 *  NUNCA lanza: cada bloque falla por su cuenta. Una cifra que no se pudo leer llega como
 *  `null` (no como 0) y `aviso` dice cuál falló; la actividad trae su propio `fallo`.
 *  Solo lectura: no hay transacción que definir. */
export type ResumenInicio = {
  productosActivos: number | null;
  variantesActivas: number | null;
  unidadesEnSede: number | null;
  /** Aviso ya redactado para la Encargada, o null si las tres cifras llegaron. */
  aviso: string | null;
  actividad: { filas: Movimiento[]; fallo: string | null };
};

export async function getResumenInicio(ubicacionId: string): Promise<ResumenInicio> {
  const supabase = await createClient();

  const [productos, variantes, stock, actividad] = await Promise.all([
    // Solo lo que hoy se vende: ni descontinuados, ni altas sin aprobar, ni la centinela
    // «Cargo especial» (que vive en `productos` como si fuera una prenda).
    supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "activo")
      .eq("estado_alta", "aprobado")
      .neq("id", ID_PRODUCTO_CARGO_ESPECIAL),
    supabase
      .from("variantes")
      .select("id", { count: "exact", head: true })
      .eq("activo", true)
      .neq("id", ID_CARGO_ESPECIAL),
    supabase
      .from("stock")
      .select("cantidad")
      .eq("ubicacion_id", ubicacionId)
      // Sin la variante centinela del «Monto manual» (999.999 unidades ficticias).
      .neq("variante_id", ID_CARGO_ESPECIAL),
    // Los últimos 8 de todo el historial (sin el recorte de 30 días de Movimientos): en
    // Inicio importa «lo último», no un período. `listarMovimientos` lanza si la base falla:
    // se atrapa aquí para que la actividad se degrade sola y no se lleve las tarjetas.
    listarMovimientos(ubicacionId, {}, { limite: 8 }).then(
      (r) => ({ filas: r.filas, fallo: null as string | null }),
      () => ({ filas: [] as Movimiento[], fallo: "No se pudo cargar la actividad reciente. Lo demás de esta pantalla sí está al día." })
    ),
  ]);

  // Una consulta caída se ve como «—» con aviso, nunca como un 0 (BACKLOG, lección de `lib/pendientes`).
  const totalProductos = tolerar({ data: productos.count, error: productos.error }, "el total de productos");
  const totalVariantes = tolerar({ data: variantes.count, error: variantes.error }, "el total de variantes");
  const filasStock = tolerar(stock, "el stock de tu ubicación");

  return {
    productosActivos: totalProductos.datos,
    variantesActivas: totalVariantes.datos,
    unidadesEnSede: sumarUnidades(filasStock.datos),
    aviso: primerAviso([totalProductos.fallo, totalVariantes.fallo, filasStock.fallo]),
    actividad,
  };
}

/** Contrato: la bandeja «Por atender» de una sede. NUNCA lanza; si una lectura cae, devuelve
 *  `incompleta: true` en vez de esconderla (ver `armarPendientes`). Solo lectura. */
export async function getPendientesInicio(ubicacionId: string, esLider: boolean): Promise<{ items: PendienteInicio[]; incompleta: boolean }> {
  const supabase = await createClient();
  const [traslados, devoluciones] = await Promise.all([
    // Ya nunca lanza: devuelve null si falla (es también el número del menú).
    getTrasladosPorAtender(ubicacionId, esLider),
    // Solo la líder aprueba devoluciones: a una integrante no le aplica.
    esLider
      ? supabase
          .from("devoluciones")
          .select("id", { count: "exact", head: true })
          .eq("ubicacion_id", ubicacionId)
          .eq("estado", "pendiente")
          .then(
            (r) => (r.error ? null : (r.count ?? 0)),
            () => null
          )
      : Promise.resolve(undefined),
  ]);
  return armarPendientes({ traslados, devoluciones });
}
