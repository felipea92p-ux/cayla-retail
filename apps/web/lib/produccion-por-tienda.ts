// Lo que cada sede dice de cada variante, para la hoja «Ver el modelo» del Resumen de Producción: «¿qué tienda lo vende?». Puro: sin Supabase ni React.
//
// CONTRATO
//   PROMETE: abrir lo que `demandaDeLaRed` suma. Por sede y variante, las ventas netas de la ventana (`DIAS_RITMO_RECIENTE`), lo que hay (`utilizable`, lo que se puede
//            vender ya), lo que viene en camino y el ritmo, con las MISMAS reglas que la suma de la red (`velocidadDeFila`): el ritmo cuenta solo si se pudo medir, y las
//            ventas que lo sostienen (`ventasBase`) son las de esa misma sede. Así la suma de las tiendas da la cifra de la red, no otra.
//   ASUME:   las filas que lee `getFilasRecientesDeSede` (una por variante y sede); una sede que no tiene fila de una variante simplemente no la nombra.
//   NO HACE: no ordena las sedes por lo que venden (conteos, no rankings: con 2 ventas por tienda un ranking es ruido, ADR-0346), no decide qué fabricar y no lee la base.
//            Una variante sin ventas, sin stock y sin nada en camino no se guarda: la hoja la lee como cero y el mensaje al navegador no carga filas vacías.

import type { TipoSede } from "./produccion-decision-reglas";
import { velocidadDeFila, type FilaResumen } from "./resumen-reglas";

export type SedeConFilas = { id: string; nombre: string; tipo: TipoSede; filas: FilaResumen[] };

/** Lo de UNA variante en UNA sede. `ritmoDia` es `null` si en esa sede no se pudo medir; `ventasBase` son las ventas netas con las que SÍ se midió (0 si no hubo ritmo). */
export type CifrasDeVariante = { ventas: number; stock: number; enCamino: number; ritmoDia: number | null; ventasBase: number };

export type DemandaDeSede = { id: string; nombre: string; tipo: TipoSede; porVariante: Record<string, CifrasDeVariante> };

/**
 * Una entrada por sede, con las variantes que importan (`variantesQueImportan`: las de los modelos que ofrece el Resumen). En el Taller, `stock` es lo terminado que espera
 * traslado y no hay ventas ni ritmo (el Taller no vende), igual que en `demandaDeLaRed`.
 */
export function demandaPorSede(sedes: readonly SedeConFilas[], variantesQueImportan: ReadonlySet<string>): DemandaDeSede[] {
  return sedes.map((s) => {
    const porVariante: Record<string, CifrasDeVariante> = {};
    for (const f of s.filas) {
      if (!variantesQueImportan.has(f.varianteId)) continue;
      let c: CifrasDeVariante;
      if (s.tipo === "taller") {
        c = { ventas: 0, stock: f.utilizable, enCamino: 0, ritmoDia: null, ventasBase: 0 };
      } else {
        const v = velocidadDeFila(f);
        const conRitmo = v.estado === "ok" && !!v.unidadesDia;
        c = { ventas: v.ventasNetas, stock: f.utilizable, enCamino: f.enCamino, ritmoDia: conRitmo ? v.unidadesDia : null, ventasBase: conRitmo ? v.ventasNetas : 0 };
      }
      if (c.ventas === 0 && c.stock === 0 && c.enCamino === 0) continue;
      porVariante[f.varianteId] = c;
    }
    return { id: s.id, nombre: s.nombre, tipo: s.tipo, porVariante };
  });
}
