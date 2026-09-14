// «No hay tu talla aquí, pero sí en Trujillo» es la venta que se pierde en el mostrador
// cuando la pantalla solo dice «sin stock». Estas reglas convierten las filas crudas de
// `stock` —de todas las sedes que RLS deje ver— en lo que la encargada de sede lee:
// cuánto hay aquí y dónde más hay.
//
// Sin DOM ni Supabase: `vender/page.tsx` la llama con lo que trae la consulta y el
// catálogo solo pinta el resultado. Probada sola (`stock-por-sede.test.ts`).
//
// Nota sobre RLS (medido 2026-09-14): `stock_select` deja ver solo las sedes que la
// persona puede operar. Una Líder ve todas; una colaboradora con sede fija ve solo la
// suya, así que para ella `otrasSedes` llega vacío — la pantalla se degrada a «Sin stock
// aquí» sin romperse. Ampliarlo es una RPC `security definer` (migración pendiente).

export type FilaStock = { variante_id: string; ubicacion_id: string; cantidad: number };
export type SedeConStock = { sede: string; cantidad: number };
export type StockDeVariante = { aqui: number; otrasSedes: SedeConStock[] };

/** «Tienda Trujillo» → «Trujillo»; «Taller» se queda. Sin códigos inventados: V2 no
 *  tiene `codigo` en `ubicaciones`, y el nombre ya es legible. */
export function nombreCortoSede(nombre: string): string {
  return nombre.replace(/^tienda\s+/i, "").trim();
}

export function agruparStockPorSede(
  filas: FilaStock[],
  ubicaciones: { id: string; nombre: string }[],
  ubicacionActualId: string,
): Map<string, StockDeVariante> {
  const nombrePorId = new Map(ubicaciones.map((u) => [u.id, nombreCortoSede(u.nombre)]));
  const porVariante = new Map<string, StockDeVariante>();
  for (const f of filas) {
    const nombre = nombrePorId.get(f.ubicacion_id);
    // Una ubicación que no está en la lista (inactiva) no se nombra ni se cuenta.
    if (nombre === undefined) continue;
    let s = porVariante.get(f.variante_id);
    if (!s) {
      s = { aqui: 0, otrasSedes: [] };
      porVariante.set(f.variante_id, s);
    }
    // Desde piso/almacén (`inventario_piso_almacen.sql`) una sede puede tener VARIAS
    // filas por prenda: se suman, no se pisan. Para un traslado cuenta el total de la
    // otra tienda, piso más almacén.
    if (f.ubicacion_id === ubicacionActualId) s.aqui += f.cantidad;
    else {
      const otra = s.otrasSedes.find((o) => o.sede === nombre);
      if (otra) otra.cantidad += f.cantidad;
      else s.otrasSedes.push({ sede: nombre, cantidad: f.cantidad });
    }
  }
  // Una sede que suma cero no se nombra; de más a menos: lo primero que se lee es donde más hay.
  for (const s of porVariante.values()) {
    s.otrasSedes = s.otrasSedes.filter((o) => o.cantidad > 0);
    s.otrasSedes.sort((a, b) => b.cantidad - a.cantidad || a.sede.localeCompare(b.sede, "es"));
  }
  return porVariante;
}

/** «15 en Taller · 2 en Trujillo», o null si no hay en ninguna otra sede. */
export function textoOtrasSedes(otras: SedeConStock[]): string | null {
  if (otras.length === 0) return null;
  return otras.map((o) => `${o.cantidad} en ${o.sede}`).join(" · ");
}
