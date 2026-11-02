import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { ORDEN_REGISTRO_COMPRAS, leerFilaCompras } from "@/lib/impuestos-reglas";
import { leerPropuestaGuardada, type PropuestaGuardada, type RegistroSire } from "@/lib/sire-propuesta-reglas";
import { aplicarResoluciones, comprobantesDeCompras, cruzarCompras, type CruceResuelto } from "@/lib/sire-cruce-reglas";

// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601). Lee la propuesta vigente del mes y el registro del ERP (el MISMO que baja el
// contador, `fn_impuestos_registro_compras`) y los cruza con `cruzarCompras`. Si una lectura falla, la pantalla lo dice y no muestra
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

  const erp = await leerRpcPorPaginas(supabase, "fn_impuestos_registro_compras", { p_mes: `${mes}-01` }, ORDEN_REGISTRO_COMPRAS, { enParalelo: 1 });
  if (erp.error) return { propuesta, cruce: null, falla: `No se pudo leer el registro de compras del ERP: ${erp.error.message}` };
  const cruce = cruzarCompras(propuesta.lineas, comprobantesDeCompras((erp.data ?? []).map(leerFilaCompras)));
  return { propuesta, cruce: aplicarResoluciones(cruce, propuesta.resoluciones), falla: null };
}
