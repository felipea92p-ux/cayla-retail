// La única cuenta de «un % se vuelve soles» del ERP: el descuento manual en % de la caja y el de una campaña.
//
// Vive sola, sin importar nada (ADR-0674, actividad 7): la etiqueta de precio de papel la necesita para decir el precio de campaña, y por
// importarla de `vender-reglas.ts` toda pantalla que dibuja una etiqueta (Recibir, Existencias, Productos…) bajaba las reglas de la caja
// enteras. `vender-reglas.ts` la sigue exportando: quien ya la importaba de ahí no cambia.

/** Un % convertido a monto por unidad, con el precio que queda SIN CÉNTIMOS SUELTOS: la cuenta exacta
 *  `precio × (100 − %) / 100` se baja al múltiplo de S/ 0.10 de abajo y el descuento es lo que falta para llegar ahí
 *  (Felipe, 2026-10-14, ADR-0403: «que no se tenga que pagar céntimos; que sea más fácil de pagar y de entender»).
 *  S/ 39.00 con 20 % da 31.20 (ya es múltiplo) y S/ 89.90 con 20 % da 71.92 → 71.90, así que descuenta 18.00.
 *  Siempre hacia abajo: nunca se cobra más que el % anunciado (Ley 29571 art. 44; la clienta no paga de más), y el extra que
 *  se regala es de 0 a 0.09 por unidad. Es la única cuenta de «un % se vuelve soles» de la caja: la usan el descuento
 *  manual en % y el de campaña (`descuentoDeCampana`). Fuera de 0..100 se recorta: 0 (o inválido) no descuenta; 100 regala
 *  la prenda, nunca más — el candado `venta_items_descuento_no_supera_precio` lo rechazaría igual.
 *
 *  ES LA MISMA CUENTA QUE `retail.fn_descuento_campana` (ADR-0403): la base la usa para verificar las campañas y los topes
 *  del 15 y del 35 %. Va en enteros (céntimos × diezmilésimas de %), no en coma flotante: en coma flotante el medio
 *  céntimo de una cuenta cae a un lado u otro según el error de la máquina (medido el 2026-10-01 en ADR-0302: 10 758 de
 *  5 940 000 combinaciones), y la caja y la base tienen que coincidir al céntimo. El % se toma con hasta 4 decimales; el
 *  de una campaña tiene 2 (`etiquetas.descuento_pct` es numeric(5,2)). */
export function descuentoUnitarioPorPorcentaje(precioUnitario: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  if (porcentaje >= 100) return precioUnitario;
  const precioC = Math.round(precioUnitario * 100);
  const pct4 = Math.round(porcentaje * 10_000); // 33.33 % → 333 300
  // precioC × (1 000 000 − pct4) / 1 000 000 es el precio final exacto en céntimos; entre 10 000 000 y × 10 lo baja al
  // múltiplo de 10 céntimos. Cabe de sobra en un entero de JS: S/ 99 999.99 → 10^13 < 2^53.
  const finalC = Math.floor((precioC * (1_000_000 - pct4)) / 10_000_000) * 10;
  return (precioC - finalC) / 100;
}

/**
 * El descuento por unidad de una campaña: el % de la campaña sobre el precio, con el precio que queda bajado al múltiplo de
 * S/ 0.10 (Felipe, 2026-10-14, ADR-0403; antes era exacto al céntimo, ADR-0302). S/ 39.00 con 20 % se cobra S/ 31.20 y
 * S/ 89.90 con 20 % se cobra S/ 71.90 (la cuenta exacta da 71.92): como mucho 9 céntimos más de descuento por prenda, nunca
 * menos que el % del papel.
 *
 * ES LA MISMA CUENTA, AL CÉNTIMO, QUE `retail.fn_descuento_campana`: la caja la calcula y `registrar_venta`,
 * `separar_prendas` y `editar_separacion` la verifican. Si divergen, la venta se rechaza en el mostrador.
 */
export function descuentoDeCampana(precio: number, pct: number): number {
  return descuentoUnitarioPorPorcentaje(precio, pct);
}
