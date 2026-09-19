// Quién ve qué dentro del módulo padre Producción (ADR-0130, D-A). Puro, sin
// Supabase ni React: lo usa el AppShell para armar el lateral y lo prueban los
// tests, porque esta regla no se puede verificar en el navegador con solo la
// sesión de un líder.
//
// Es una regla de MENÚ (qué se le muestra a quién). El candado real sigue en la
// base: `fn_puede_registrar_compras` / `fn_puede_ver_dinero_de_compras` para
// Compras y `fn_puede_operar_ubicacion` en cada RPC del Taller.

export type ClaveMenuProduccion = "proveedores" | "comprobantes" | "recibir" | "porPagar" | "ordenes";

export type PerfilMenu = {
  esLider: boolean;
  ubicacionTipo: "tienda" | "almacen" | "taller";
};

/** Orden del recorrido: el mismo que ya tenía el grupo Compras (proveedor →
 *  factura → recepción → pago) y después la fabricación. Resumen, Insumos y
 *  Eficiencia se suman acá cuando existan (fases F3, F6 y F7). */
const ORDEN_LIDER: ClaveMenuProduccion[] = ["proveedores", "comprobantes", "recibir", "porPagar", "ordenes"];

/**
 * - **Líder:** ve todo, desde cualquier ubicación (la base ya lo permite:
 *   `fn_puede_operar_ubicacion` = líder o mi ubicación). Reemplaza la regla del
 *   2026-09-17 «Producción solo parado en el Taller, líder incluido».
 * - **Quien trabaja en el Taller:** ve las Órdenes. Su «Recibir mercadería» sigue
 *   viviendo en Inventario (como el de cualquier no líder), para que la misma
 *   ruta no aparezca en dos grupos y marque dos filas activas.
 * - **Quien trabaja en una tienda o un almacén:** no ve el módulo.
 */
export function hijosMenuProduccion(perfil: PerfilMenu): ClaveMenuProduccion[] {
  if (perfil.esLider) return ORDEN_LIDER;
  if (perfil.ubicacionTipo === "taller") return ["ordenes"];
  return [];
}
