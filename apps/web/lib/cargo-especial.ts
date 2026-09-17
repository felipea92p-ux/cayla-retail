// La variante centinela «Cargo especial» (20260912234726_cargo_especial_pos.sql):
// existe para que la caja cobre un monto manual sin prenda. NO es mercadería —
// pero vive en `variantes`, tiene 999.999 unidades de stock por ubicación y deja
// una `salida` en `movimientos` por cada cobro. Toda pantalla que cuente
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
