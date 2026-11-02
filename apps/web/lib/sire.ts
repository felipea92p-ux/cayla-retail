import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { ORDEN_REGISTRO_COMPRAS, ORDEN_REGISTRO_VENTAS, leerFilaCompras, leerFilaVentas } from "@/lib/impuestos-reglas";
import { leerPropuestaGuardada, type PropuestaGuardada, type RegistroSire } from "@/lib/sire-propuesta-reglas";
import { estadoDeRegistro, type EstadoSire } from "@/lib/sire-estado-reglas";
import { aplicarResoluciones, comprobantesDeCompras, comprobantesDeVentas, cruzarCompras, cruzarVentas, type CruceResuelto, type ResultadoCruce } from "@/lib/sire-cruce-reglas";

// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601). Lee la propuesta vigente del mes y el registro del ERP (el MISMO que baja el
// contador, `fn_impuestos_registro_compras` o `_ventas`) y los cruza con `cruzarCompras` o `cruzarVentas`. Si una lectura falla, la pantalla lo dice y no muestra
// listas vacías como si todo cuadrara (principio 9).

export type ComparacionSire = {
  propuesta: PropuestaGuardada | null;
  cruce: CruceResuelto | null;
  falla: string | null;
};

export async function getComparacionSire(registro: RegistroSire, mes: string): Promise<ComparacionSire> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_sire_propuesta" as never, { p_registro: registro, p_mes: `${mes}-01` } as never);
  if (error) return { propuesta: null, cruce: null, falla: `No se pudo leer la propuesta de SUNAT: ${error.message}` };
  const propuesta = leerPropuestaGuardada(data);
  if (!propuesta) return { propuesta: null, cruce: null, falla: null };

  // Por páginas: las ventas de un mes pasan de 1.000 comprobantes y PostgREST corta ahí sin avisar.
  const erp =
    registro === "compras"
      ? await leerRpcPorPaginas(supabase, "fn_impuestos_registro_compras", { p_mes: `${mes}-01` }, ORDEN_REGISTRO_COMPRAS, { enParalelo: 1 })
      : await leerRpcPorPaginas(supabase, "fn_impuestos_registro_ventas", { p_mes: `${mes}-01` }, ORDEN_REGISTRO_VENTAS);
  if (erp.error) return { propuesta, cruce: null, falla: `No se pudo leer el registro de ${registro} del ERP: ${erp.error.message}` };
  const filas = erp.data ?? [];
  const cruce: ResultadoCruce =
    registro === "compras"
      ? cruzarCompras(propuesta.lineas, comprobantesDeCompras(filas.map(leerFilaCompras)))
      : cruzarVentas(propuesta.lineas, comprobantesDeVentas(filas.map(leerFilaVentas)));
  return { propuesta, cruce: aplicarResoluciones(cruce, propuesta.resoluciones), falla: null };
}

/** El estado de la comparación de un mes, para «Antes de declarar» y el Cierre (actividad 4): el mismo cruce, resumido. Las ventas solo
 *  leen su registro (más de 1.000 filas) si alguien subió su propuesta. */
export async function getEstadoSire(mes: string): Promise<EstadoSire> {
  const [compras, ventas] = await Promise.all([getComparacionSire("compras", mes), getComparacionSire("ventas", mes)]);
  return { mes, compras: estadoDeRegistro(compras), ventas: estadoDeRegistro(ventas) };
}
