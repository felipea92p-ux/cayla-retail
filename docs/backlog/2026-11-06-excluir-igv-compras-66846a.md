## Costo con IGV en Ganancias y pérdidas (2026-11-06)
- [ ] Confirmar S/ 62,035 contra el PDT 621 de septiembre (si difiere, fila nueva en `saldo_favor_igv`).
- [ ] Medir qué parte del costo tuvo factura (registro de compras o SIRE). Sin eso, −14,908 es solo el techo de octubre (hoy −26,488.05).
- [ ] Corregir el costo con rastro (`costo_correcciones`): `venta_items.costo_unitario` sellado de octubre y `variantes.costo` del stock. Mueve el 591 del arranque del Balance (ADR-0618). Con el OK de Felipe.
- [ ] Revisar los gastos con factura sin IGV separado: de octubre solo S/ 117 lo tienen (luz, internet, telefonía, comisiones en 0).
- [ ] Mostrar el crédito fiscal aparte (cuánto queda y para cuántos meses alcanza), si Felipe lo pide.

## IGV de gestión (ADR-0620, 2026-11-06) — reemplazado por la regla pareja (ADR-0624, 2026-11-07)
~~Lo pendiente del «IGV que dice el líder» (decir octubre, `/chaos` de la hoja, prorratear el mes en curso, Resumen a gestión, probar decir mientras se cierra) ya no aplica: la hoja y la capa se retiraron.~~
Las dos migraciones de ADR-0620 están en producción; la tabla `igv_del_mes` tiene 0 filas (medido el 2026-11-07).

## Regla pareja del IGV (ADR-0624, 2026-11-07)
No está en producción: `20261107174000_igv_de_las_ventas_regla_pareja.sql`.
- [ ] Abrir el PR con `/abrir-pr`.
- [ ] Pegar la migración con el OK de Felipe, antes de publicar la web (una sola ejecución; pasos en su cabecera). Retira `igv_del_mes` solo si sigue vacía.
- [ ] Refrescar el volcado tras pegar (`docs/datos/generado/COMO-REFRESCAR.md`): sale `igv_del_mes`, entra `fn_igv_de_las_ventas`.
- [ ] Mirar Ganancias en el navegador con datos reales: octubre debe decir Cobraste 133,922.31, IGV 20,501.26 y Lo que vendiste 113,421.05, y el resultado igual al del libro. Impuestos de octubre debe decir cuánto se usó del saldo a favor.
- [ ] `/formidable` en Ganancias (las dos filas nuevas del informe y la cascada).
- [ ] **Entrega 2, cuando el contador confirme facturas:** corregir el costo de la carga inicial con IGV (con rastro, mueve el 591 del arranque); `venta_descuento_bajo_costo` a precio sin IGV contra costo neto; Taller y gastos (IGV con factura no es costo, de boleta o informal sí). Las prendas sin registrar de octubre no se tocan.
- [ ] **Aclarar con el contador:** los S/ 62,035 contra el PDT 621, que la 4011 arranque a favor y los S/ 285.50 entre el IGV del diario y el de comprobantes en octubre.
- [ ] Medir si Patrimonio de octubre muestra S/ 172,458.63 «sin explicar», porque el arranque es del 1-nov. Sin medir en vivo.
- [ ] Poner al día los escenarios `estados.detalle` y `estados.libro` de `apps/web/tema/escenarios/registro.mjs`: buscan `.estados-parte` y «formato formal», que ya no se dibujan desde el informe del 2026-11-06, y no abren nada.
