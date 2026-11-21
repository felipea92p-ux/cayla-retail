// Existencias ▸ el filtro «Empresa» (ADR-0683, actividad 7; Felipe 2026-11-21: «las unidades de esa dueña»). Lógica pura.
//
// LA REGLA. Donde conviven dos empresas o más, elegir una deja en la lista solo las tallas con unidades suyas, y cada talla dice SUS cantidades:
// piso, almacén, apartado y disponible salen de sus unidades lugar por lugar (`fn_stock_de_empresa`), sumadas con la regla de siempre
// (`sumarCantidades`). Así «Hoy», las cifras de arriba y el valor del inventario hablan de lo de esa dueña, no de lo de la tienda entera.
// Lo que solo viene en camino no tiene dueña todavía: con el filtro puesto, no sale.

import { sumarCantidades, type Cantidades, type FilaCantidadCruda } from "./inventario-reglas";

/** Las filas de `fn_stock_de_empresa` a cantidades por talla. Lo que no se entiende se descarta. */
export function cantidadesDeEmpresa(filas: readonly Record<string, unknown>[]): Map<string, Cantidades> {
  const crudas: FilaCantidadCruda[] = filas.flatMap((f) =>
    typeof f.variante_id === "string"
      ? [{ variante_id: f.variante_id, cantidad: Number(f.cantidad) || 0, cantidad_apartada: Number(f.cantidad_apartada) || 0, sububicacion: { tipo: typeof f.tipo === "string" ? f.tipo : null } }]
      : [],
  );
  return sumarCantidades(crudas);
}

/** Solo las tallas con unidades de esa dueña, cada una con SUS cantidades. */
export function soloUnidadesDe<F extends { varianteId: string } & Cantidades>(filas: readonly F[], cantidades: ReadonlyMap<string, Cantidades>): F[] {
  return filas.flatMap((f) => {
    const c = cantidades.get(f.varianteId);
    if (!c || (c.total <= 0 && (c.danado ?? 0) <= 0)) return [];
    return [{ ...f, ...c }];
  });
}
