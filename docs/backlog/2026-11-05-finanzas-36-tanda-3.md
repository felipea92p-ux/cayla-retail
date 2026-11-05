## Las 36 de Finanzas, tanda 3: lo que queda (2026-11-05)

- [ ] Pegar en producción, en orden y con el OK de Felipe: `20261105235000`, `20261106000000`, `20261106001000`, `20261106002000`, `20261106005000`.
- [ ] Que el contador revise, antes de firmar octubre: que el mes de la baja lleve cuota entera; que `venta_sin_prenda`, `redondeo`, `recepcion_sin_factura` y `sobrantes_sin_asiento` den nota sin asiento; el código 6959 de los sobrantes; que octubre no reconozca sus sobrantes (unos S/ 50 mil) mientras sí lleva sus faltantes (unos S/ 10 mil); y la fecha de arranque.
- [ ] Felipe: decir la fecha de arranque y cuánto había en cada caja fuerte. Si arranca el 1-oct, los bancos que empiezan el 28-oct necesitan su saldo de ese día.
- [ ] Mirar en pantalla el aviso del arranque y el saldo de la caja fuerte en Editar cuenta: están probados en reglas y en base, no en el navegador.
- [ ] `/chaos` en Saldos de arranque y Cierre, en la tanda 9, antes de firmar.

## Prueba inestable, fuera de esta tanda

- `scripts/pruebas/perdidas.mjs`, caso M5 («el Estado de resultados da EXACTAMENTE los mismos números antes y después»): con el mismo código pasa y falla entre corridas en la base local. Se vio por primera vez en esta tanda, y no se confirmó si ya pasaba antes.
