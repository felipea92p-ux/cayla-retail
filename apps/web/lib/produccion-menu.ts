// Quién ve qué en el menú de Producción y de Compras (ADR-0133, D-A). Puro, sin Supabase ni React: lo usa el
// AppShell para armar el lateral, las páginas de Producción para decidir si abren, y lo prueban los tests, porque
// esta regla no se puede verificar en el navegador con solo la sesión de un líder.
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

/** Pantallas de Producción, en orden. Hoy Resumen, Órdenes, Insumos, Proveedores, Comprobantes, Recibir y Por pagar (Resumen, Proveedores, Comprobantes y Por pagar
 *  son solo del líder): Eficiencia se suma acá cuando exista (fase F7). */
export type ClaveMenuProduccion = "resumenProduccion" | "ordenes" | "insumos" | "proveedoresProduccion" | "comprobantesProduccion" | "recibirProduccion" | "porPagarProduccion";

/**
 * Producción se ve **solo parado en un Taller, líder incluido** (decisión de Felipe, 2026-09-20: vuelve a la regla del
 * 2026-09-17 y deja sin efecto la D-A del 2026-09-19, que le daba el módulo al líder desde cualquier ubicación).
 *
 * Se decide por el TIPO de la ubicación activa —no por su nombre—: para un líder es la que eligió en el selector, para
 * los demás la de su sede. Por eso un líder que mira desde una tienda, un almacén o el Taller ve cosas distintas, y un
 * segundo Taller (si algún día existe) entra solo, sin tocar esta regla.
 *
 * Es solo visibilidad: la base sigue dejando al líder operar el Taller desde cualquier sede (`fn_puede_operar_ubicacion`
 * = líder o mi ubicación), porque el líder es de confianza; lo que se busca es que la tienda no cargue con un módulo
 * que no es suyo.
 */
export function puedeVerProduccion(perfil: Pick<PerfilMenu, "ubicacionTipo">): boolean {
  return perfil.ubicacionTipo === "taller";
}

export function hijosMenuProduccion(perfil: PerfilMenu): ClaveMenuProduccion[] {
  if (!puedeVerProduccion(perfil)) return [];
  // Proveedores, Comprobantes y Por pagar son solo del líder (F4a a F4c): llevan datos bancarios y montos (D-G). Recibir lo usa también quien trabaja
  // en el Taller (F4d), sin ver dinero. Orden como en Compras: proveedor → comprobante → recibir → pago.
  return perfil.esLider ? ["resumenProduccion", "ordenes", "insumos", "proveedoresProduccion", "comprobantesProduccion", "recibirProduccion", "porPagarProduccion"] : ["ordenes", "insumos", "recibirProduccion"];
}

export type ClaveMenuCompras = "proveedores" | "comprobantes" | "recibir" | "porPagar" | "notasCredito";

/** Compras es el módulo de comprar para las TIENDAS: parado en el Taller no se muestra (decisión de Felipe, 2026-09-21), del mismo modo que
 *  Producción no se muestra parado en una tienda. Se decide por el TIPO de la ubicación activa, no por su nombre. Es solo visibilidad del menú:
 *  las URLs de Compras siguen abriendo (otras pantallas enlazan a ellas) y el candado real sigue siendo el de cada RPC. */
export function puedeVerCompras(perfil: Pick<PerfilMenu, "esLider" | "ubicacionTipo">): boolean {
  return perfil.esLider && perfil.ubicacionTipo !== "taller";
}

/** Compras es solo de líder (su layout redirige al resto). Mismo orden que ya tenía: proveedor → factura →
 *  recepción → pago. El «Recibir mercadería» de quien no es líder vive en Inventario, donde está el stock.
 *  «Notas de crédito» (2026-09-19) va JUNTO a «Por pagar» y al final: las dos son dinero del proveedor —una
 *  lo que se le debe, otra lo que él debe— y se miran seguidas. */
export function hijosMenuCompras(perfil: PerfilMenu): ClaveMenuCompras[] {
  return puedeVerCompras(perfil) ? ["proveedores", "comprobantes", "recibir", "porPagar", "notasCredito"] : [];
}
