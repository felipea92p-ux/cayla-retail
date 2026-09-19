// Quién ve qué en el menú de Producción y de Compras (ADR-0133, D-A). Puro, sin Supabase ni React: lo usa el
// AppShell para armar el lateral y lo prueban los tests, porque esta regla no se puede verificar en el navegador
// con solo la sesión de un líder.
//
// Son DOS módulos distintos (decisión de Felipe, 2026-09-19): Producción (fabricar) y Compras (comprar). Se
// conectan por los datos —la factura de tela abre un lote, la orden lo consume—, no por el menú: cada uno tiene
// su grupo, sus proveedores y sus pantallas.
//
// Es una regla de MENÚ (qué se le muestra a quién). El candado real sigue en la base: `fn_puede_registrar_compras`
// / `fn_puede_ver_dinero_de_compras` para Compras y `fn_puede_operar_ubicacion` en cada RPC del Taller.

export type PerfilMenu = {
  esLider: boolean;
  ubicacionTipo: "tienda" | "almacen" | "taller";
};

/** Pantallas de Producción, en orden. Hoy solo Órdenes: Resumen, Proveedores de producción, Insumos y Eficiencia se
 *  suman acá cuando existan (fases F3 a F7). */
export type ClaveMenuProduccion = "ordenes";

/**
 * - **Líder:** ve Producción desde cualquier ubicación (la base ya lo permite: `fn_puede_operar_ubicacion` = líder
 *   o mi ubicación). Reemplaza la regla del 2026-09-17 «solo parado en el Taller, líder incluido».
 * - **Quien trabaja en el Taller:** ve las mismas pantallas de fabricación.
 * - **Quien trabaja en una tienda o un almacén:** no ve el módulo.
 */
export function hijosMenuProduccion(perfil: PerfilMenu): ClaveMenuProduccion[] {
  if (perfil.esLider || perfil.ubicacionTipo === "taller") return ["ordenes"];
  return [];
}

export type ClaveMenuCompras = "proveedores" | "comprobantes" | "recibir" | "porPagar";

/** Compras es solo de líder (su layout redirige al resto). Mismo orden que ya tenía: proveedor → factura →
 *  recepción → pago. El «Recibir mercadería» de quien no es líder vive en Inventario, donde está el stock. */
export function hijosMenuCompras(perfil: PerfilMenu): ClaveMenuCompras[] {
  return perfil.esLider ? ["proveedores", "comprobantes", "recibir", "porPagar"] : [];
}
