// La variante centinela «Cargo especial» (20260912234726_cargo_especial_pos.sql):
// existe para la «Prenda sin registrar» de la caja (ADR-0179; antes «Monto manual»). NO es mercadería —
// pero vive en `variantes`. Desde ADR-0179 su venta ya NO mueve stock (antes tenía
// 999.999 unidades ficticias por sede y dejaba una `salida` por cada cobro, que
// pueden seguir en bases viejas): el único movimiento es el de la prenda real al
// regularizarla. Toda pantalla que cuente
// unidades o liste el historial la EXCLUYE por este id, no por
// `variantes.activo`: las prendas descontinuadas también están en `false` y su
// historial sí debe verse. (Decisión de Felipe, 2026-09-15: «contamina el
// ledger, excluye todo registro innecesario».)
//
// Vive en lib/ sin importar nada de servidor: lo usan componentes cliente
// (PuntoDeVenta) y lecturas de servidor (inventario-v2) por igual.
// El mismo valor está como constante `c_cargo_especial` en `registrar_venta`,
// `fn_movimientos` y `fn_movimientos_resumen`.
export const ID_CARGO_ESPECIAL = "22222222-2222-4222-8222-222222222222";

/** El PRODUCTO padre de la variante centinela (mismo archivo de migración). Vive en `productos`
 *  con `estado = 'activo'`, así que todo conteo de productos lo debe excluir por este id. */
export const ID_PRODUCTO_CARGO_ESPECIAL = "11111111-1111-4111-8111-111111111111";
