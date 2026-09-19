import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { marcarPorVencer, type ProformaFila } from "@/lib/proformas-reglas";
import { resumenProformas, type ResumenProformas } from "@/lib/facturacion-reglas";

export type { EstadoProforma, Proforma, ProformaFila } from "@/lib/proformas-reglas";
export { marcarPorVencer } from "@/lib/proformas-reglas";

const COLUMNAS_PROFORMA = "id, ubicacion_id, cliente_nombre, cliente_num_doc, total, estado, comprobante_id, created_at, vence_at";

// Lectura pura (lib/ nunca escribe — la escritura pasa por `crear_proforma` /
// `convertir_proforma_a_comprobante`, ver ADR-0007). Trae también las
// "convertida"/"anulada" recientes del mes: una proforma que ya se convirtió
// sigue siendo parte de la historia de facturación de ese mes, no desaparece.
//
// Las VIGENTES se traen aparte, sin filtro de mes (2026-09-16): son una cola de
// trabajo, no un historial. Si dependieran del mes, una proforma creada el 30
// desaparecía de la pantalla el día 1 aunque siguiera pudiéndose convertir —
// exactamente el filtro-que-hay-que-recordar-aplicar que este panel dice evitar
// para "por vencer", pero que el límite de mes seguía colando por abajo.
export async function getProformasMes(desde: string, hasta: string) {
  const supabase = await createClient();
  // Misma lógica que los comprobantes: una proforma que no se ve se vuelve a cotizar,
  // y la clienta recibe dos precios distintos por lo mismo.
  const [resVigentes, resDelMes] = await Promise.all([
    supabase.from("proformas").select(COLUMNAS_PROFORMA).eq("estado", "vigente"),
    supabase
      .from("proformas")
      .select(COLUMNAS_PROFORMA)
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false }),
  ]);

  const vigentes = exigir(resVigentes, "las proformas vigentes") as ProformaFila[];
  const delMes = exigir(resDelMes, "las proformas del mes") as ProformaFila[];
  // Una vigente creada este mismo mes ya viene en `delMes` — el Map por id la
  // deja una sola vez sin importar el orden en que se agreguen.
  const porId = new Map(delMes.map((p) => [p.id, p]));
  for (const p of vigentes) porId.set(p.id, p);

  return marcarPorVencer([...porId.values()]);
}

/** Las proformas vigentes de hoy, sin filtro de mes (son una cola de trabajo, no un
 *  historial — ver `getProformasMes`), resumidas para el contador de la pestaña. `null` si
 *  la consulta falla (`tolerar`: sin contador, nunca uno inventado). */
export async function getResumenProformas(): Promise<ResumenProformas | null> {
  const supabase = await createClient();
  const res = await supabase.from("proformas").select(COLUMNAS_PROFORMA).eq("estado", "vigente");
  const { datos, fallo } = tolerar(res, "las proformas vigentes");
  // `fallo` es el aviso para la persona; la causa real (Postgres) es para quien lea el log.
  if (fallo) console.error("Facturación: no se pudo leer las proformas vigentes (contador de la pestaña Proformas):", res.error?.message);
  return datos ? resumenProformas(datos as ProformaFila[]) : null;
}
