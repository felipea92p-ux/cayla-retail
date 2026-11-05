## Las 36 de Finanzas: lo que sigue después de la tanda 1 (2026-11-05)

Orden aprobado por Felipe. Lo que depende del contador avanza con la recomendación y se deja escrito el supuesto; pegar en producción y lo que mueve dinero esperan su OK en cada caso.

- [ ] Pegar en producción `20261105215000` y `20261105220000`, con el OK de Felipe, junto con publicar la web de la tanda 1 (la tarea 24 llama a `fn_lo_que_falta_del_mes`: sin ella, «¿Ya pagaste el mes?» dice «Por confirmar»).
- [ ] Tanda 2: tareas 1, 3, 7.
- [ ] Tanda 3: tareas 8, 4, 5, 6, 9.
- [ ] Tanda 4: tareas 10, 12 con 13, 22, 14, 15, 17.
- [ ] Tanda 5: tarea 16, después de que Felipe lea el mensaje de SUNAT en Sentry.
- [ ] Tanda 6: tarea 27; 23 y 28 cuando entre `claude/estados-financieros-vidrio`.
- [ ] Tanda 7: tareas 18, 19, 20, 21.
- [ ] Tanda 8: tareas 29, 30, 31, 32, 33.
- [ ] Tanda 9: tarea 36, `/chaos`: primero Cierre, Saldos de arranque y las tres hojas de Gastos, antes de firmar octubre; después, lo demás.

## Deriva diaria: lo que dio la primera comparación real (2026-11-05)

- [ ] Hay objetos en producción que ninguna rama del repo tiene y diferencias que vienen de ramas sin fusionar. La lista no se publica (el repo es público): se saca con el artefacto `huellas-main-mas-pegados` y `deriva.sql` en solo lectura. Felipe decide qué rama se fusiona; el aviso #612 sigue abierto hasta entonces.
- [ ] Mirar la función de causas de mercadería, distinta entre producción y main, antes de empezar la tarea 5: es la que esa tarea parcha.

## Tarea 35: lo que no se bloqueó a propósito

- Los pagos que son opcionales dentro de un comprobante (órdenes de compra e insumos, producción) y los cobros de tienda (devoluciones, apartados) muestran la falla y dejan seguir. Cerrar caja no se traba. Las hojas de gasto conservan su combo de medios cuando no hay cuentas.
- Lo que sí espera a poder leer las cuentas: pagar una factura, pagar juntas, pagar un comprobante de producción, reembolsar un saldo a favor, un depósito de Nos debe y un gasto del viaje.
