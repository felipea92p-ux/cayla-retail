// Quién ve qué en el menú de Producción y de Compras (ADR-0133, D-A).
//
// LA REGLA YA NO VIVE ACÁ (2026-09-21, paso 1 de «menú a datos»): está declarada en el árbol de `lib/menu.ts` —Producción
// con `ubicaciones: ["taller"]`, sus tres puertas de dinero con `exige: "verDinero"` y el Resumen con `exige: "analizar"`;
// Compras con `ubicaciones: ["tienda", "almacen"]` y sus cinco puertas con `exige: "verDinero"`— y se calcula con
// `menuPara`. Este archivo queda como vista de compatibilidad para lo que todavía lo importa: las dos páginas de Producción
// (`puedeVerProduccion`) y su prueba, que sigue corriendo SIN cambios y por eso demuestra que la regla absorbida es la misma.
// Cuando esas páginas importen de `lib/menu.ts`, este archivo se borra.
//
// Son DOS módulos distintos (decisión de Felipe, 2026-09-19): Producción (fabricar) y Compras (comprar). Se conectan por
// los datos —la factura de tela abre un lote, la orden lo consume—, no por el menú.
//
// Es una regla de MENÚ (qué se le muestra a quién). El candado real sigue en la base: `fn_puede_registrar_compras`
// / `fn_puede_ver_dinero_de_compras` para Compras y `fn_puede_operar_ubicacion` en cada RPC del Taller.

import { menuPara, permisosDe, esGrupoMenu, type TipoUbicacion } from "./menu";

export { puedeVerProduccion } from "./menu";

export type PerfilMenu = {
  esLider: boolean;
  ubicacionTipo: TipoUbicacion;
};

/** Pantallas de Producción, en orden. Hoy Resumen, Órdenes, Insumos, Proveedores, Comprobantes, Recibir y Por pagar (Resumen,
 *  Proveedores, Comprobantes y Por pagar son solo de quien ve el dinero; Recibir lo usa también quien trabaja en el Taller):
 *  Eficiencia se suma en `lib/menu.ts` cuando exista (fase F7). La clave es lo que sigue al punto del id del nodo
 *  (`produccion.ordenes`, `produccion.resumenProduccion`…). */
export type ClaveMenuProduccion = "resumenProduccion" | "ordenes" | "insumos" | "proveedoresProduccion" | "comprobantesProduccion" | "recibirProduccion" | "porPagarProduccion";

export type ClaveMenuCompras = "proveedores" | "comprobantes" | "recibir" | "porPagar" | "notasCredito";

/** Compras es el módulo de comprar para las TIENDAS: parado en el Taller no se muestra (decisión de Felipe, 2026-09-21), del
 *  mismo modo que Producción no se muestra parado en una tienda. Se decide por el TIPO de la ubicación activa, no por su
 *  nombre. Es solo visibilidad del menú: las URLs de Compras siguen abriendo (otras pantallas enlazan a ellas) y el candado
 *  real sigue siendo el de cada RPC. Sale del árbol: el grupo «compras» de `lib/menu.ts` (ubicaciones + `verDinero`). */
export function puedeVerCompras(perfil: Pick<PerfilMenu, "esLider" | "ubicacionTipo">): boolean {
  return hijosDe("compras", perfil).length > 0;
}

/** Las hijas que `menuPara` le pinta a este perfil en el grupo `grupoId`, por la clave que sigue al punto del id del nodo. */
function hijosDe(grupoId: string, perfil: PerfilMenu): string[] {
  const { riel } = menuPara({ permisos: permisosDe(perfil.esLider ? "lider" : "integrante"), ubicacionTipo: perfil.ubicacionTipo });
  const fila = riel.find((f) => f.id === grupoId);
  return fila && esGrupoMenu(fila) ? fila.hijos.map((h) => h.id.slice(h.id.indexOf(".") + 1)) : [];
}

export function hijosMenuProduccion(perfil: PerfilMenu): ClaveMenuProduccion[] {
  return hijosDe("produccion", perfil) as ClaveMenuProduccion[];
}

/** Compras es solo de quien ve el dinero (su layout redirige al resto) y solo en tiendas y almacenes (`puedeVerCompras`).
 *  Proveedor → factura → recepción → pago → notas de crédito. El «Recibir mercadería» de quien no es líder vive en
 *  Inventario, donde está el stock. */
export function hijosMenuCompras(perfil: PerfilMenu): ClaveMenuCompras[] {
  return hijosDe("compras", perfil) as ClaveMenuCompras[];
}
