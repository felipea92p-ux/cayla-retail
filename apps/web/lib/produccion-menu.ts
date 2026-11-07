// Quién ve qué en el menú de Producción y de Compras (ADR-0133, D-A).
//
// LA REGLA YA NO VIVE ACÁ (2026-09-21, paso 1 de «menú a datos»): está declarada en el árbol de `lib/menu.ts` —Producción
// con `ubicaciones: ["taller"]`, sus tres puertas de dinero y el Resumen con `exige: "verDinero"` (solo el líder; el
// Resumen exigía `analizar` hasta el 2026-09-22, cuando ese permiso pasó a salir del módulo Análisis); Compras con
// `ubicaciones: ["tienda", "almacen"]` y sus cinco puertas con `exige: "verDineroCompras"` (20260923130000)— y se calcula con
// `menuPara`. Este archivo queda solo como vista de compatibilidad para lo que todavía lo importa: las páginas de Producción
// (`puedeVerProduccion`). Las vistas `hijosMenuProduccion`, `hijosMenuCompras` y `puedeVerCompras`, que solo usaba su prueba,
// se borraron (el menú y sus reglas se prueban en `lib/menu.test.ts`). Cuando esas páginas importen de `lib/menu.ts`, este
// archivo se borra.
//
// Son DOS módulos distintos (decisión de Felipe, 2026-09-19): Producción (fabricar) y Compras (comprar). Se conectan por
// los datos —la factura de tela abre un lote, la orden lo consume—, no por el menú.
//
// Es una regla de MENÚ (qué se le muestra a quién). El candado real sigue en la base: `fn_puede_registrar_compras`
// / `fn_puede_ver_dinero_de_compras` para Compras y `fn_puede_operar_ubicacion` en cada RPC del Taller.

export { puedeVerProduccion } from "./menu";
