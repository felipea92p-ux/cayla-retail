// Cuántas unidades libres hay de cada prenda en las tiendas de la cola «Ventas sin registrar» (ADR-0360), para el puente: «3 en TRU»,
// «Sin unidades libres» y la sugerida (la única prenda que calza y tiene stock).
//
// CONTRATO
//   PROMETE: `ubicacion_id → (variante_id → unidades libres)`, leído de `fn_existencias` (la única fórmula de «cuánto hay», ADR-0270:
//            sin apartadas, sin cuarentena, sin tallas retiradas, sin pruebas). Solo trae las prendas con al menos una unidad: una
//            prenda que no está en el mapa tiene 0. Una tienda cuya lectura falló NO aparece (la pantalla dice «no pudimos leer el
//            stock» en vez de dibujar ceros que parecerían ciertos).
//   ASUME:   que quien llama ve Existencias (la puerta de `fn_existencias` es `fn_tiene_acceso_retail`). Se lee por páginas: PostgREST corta en
//            1.000 filas sin avisar y TRU ya da 1.489 (2026-10-23; cuenta también las prendas con stock 0).
//   SE DEGRADA: nunca lanza. Es lo accesorio: sin stock la pantalla sigue entera (se puede regularizar igual; la base es la que decide).
import { createClient } from "./supabase/server";
import { leerRpcPorPaginas, ORDEN_FN_EXISTENCIAS } from "./rpc-por-paginas";

type FilaExistencias = { variante_id: string; disponible: number };

export async function getDisponiblePorSede(ubicacionIds: readonly string[]): Promise<Record<string, Record<string, number>>> {
  const sedes = [...new Set(ubicacionIds)];
  if (sedes.length === 0) return {};
  const supabase = await createClient();
  const lecturas = await Promise.all(
    sedes.map(async (sede) => {
      try {
        const { data, error } = await leerRpcPorPaginas(supabase, "fn_existencias", { p_ubicacion_id: sede }, ORDEN_FN_EXISTENCIAS, { enParalelo: 1 });
        if (error || !data) return null;
        const filas = data as unknown as FilaExistencias[];
        return [sede, Object.fromEntries(filas.filter((f) => Number(f.disponible) > 0).map((f) => [f.variante_id, Number(f.disponible)]))] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(lecturas.filter((l): l is NonNullable<typeof l> => l !== null));
}
