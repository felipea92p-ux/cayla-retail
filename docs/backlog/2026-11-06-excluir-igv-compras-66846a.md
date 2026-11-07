## Costo con IGV en Ganancias y pérdidas (2026-11-06)
- [ ] Confirmar S/ 62,035 contra el PDT 621 de septiembre (si difiere, fila nueva en `saldo_favor_igv`).
- [ ] Medir qué parte del costo tuvo factura (registro de compras o SIRE). Sin eso, −14,908 es solo el techo de octubre (hoy −26,488.05).
- [ ] Corregir el costo con rastro (`costo_correcciones`): `venta_items.costo_unitario` sellado de octubre y `variantes.costo` del stock. Mueve el 591 del arranque del Balance (ADR-0618). Con el OK de Felipe.
- [ ] Revisar los gastos con factura sin IGV separado: de octubre solo S/ 117 lo tienen (luz, internet, telefonía, comisiones en 0).
- [ ] Mostrar el crédito fiscal aparte (cuánto queda y para cuántos meses alcanza), si Felipe lo pide.

## IGV de gestión (ADR-0620, 2026-11-06)
No está en producción: `20261107034000_igv_de_gestion.sql` y `20261107035000_arranque_igv_contra_el_credito.sql`.
- [ ] Abrir el PR con `/abrir-pr`.
- [ ] Antes del PR, correr `/chaos` en la hoja «IGV del mes» y `/formidable` en la hoja y en Ganancias. No se corrieron; `DecirIgvDelMesModal` guarda, y `/chaos` es obligatoria.
- [ ] Pegar las dos migraciones con el OK de Felipe, antes de publicar la web (pasos en el ADR-0620). La segunda escribe filas en `saldos_iniciales`.
- [ ] Con la sesión de Felipe, confirmar octubre: 133,922.31 de ventas con IGV y −5,986.79 con 0 dicho. Comparar también el saldo a favor de Impuestos al cierre de octubre contra 41,878.00.
- [ ] Mirar en el navegador, con datos reales, octubre con 0, con un monto y con varios meses. El punto de octubre tiene que dar lo mismo que la cabecera y «Ganaste».
- [ ] Refrescar el volcado tras pegar, para que `igv_del_mes` entre al diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] Decir octubre antes de cerrarlo.
- [ ] **PR aparte: Finanzas ▸ Resumen pasa a gestión.** Hoy solo se rotula «Según el libro», y octubre dirá −26,488.05 ahí y −5,986.79 en Ganancias. Toca punto de equilibrio y restas repartidas en varias pantallas.
- [ ] **Aclarar con el contador:** los S/ 62,035 contra el PDT 621 (ya pendiente arriba), que la 4011 arranque a favor, cómo tratar el IGV que queda como ganancia mientras dure el crédito y los S/ 285.50 entre el IGV del diario y el de comprobantes en octubre. Si el PDT difiere, se corrigen `saldo_favor_igv` y el arranque, cada uno por su lado.
- [ ] Decisión de Felipe: ¿el mes en curso prorratea por días lo dicho? Hoy noviembre resta el monto entero contra los días que van; el chip contra «a esta fecha» se apaga y la fila lo explica, pero la cifra sale más baja al inicio del mes. Prorratear cambia cuánto se resta (ADR-0620).
- [ ] Medir si `metaVentasPresupuesto` descuenta la meta dos veces (`resumen-telar-reglas.ts:221`, `equilibrio-mes-reglas.ts:102`). Sin medir en vivo.
- [ ] Medir si Patrimonio de octubre muestra S/ 172,458.63 «sin explicar», porque el arranque es del 1-nov. Sin medir en vivo.
- [ ] Probar decir el monto mientras otra sesión cierra el mes. Hereda el cerrojo de `fn_exigir_mes_abierto`, pero la suite no lo prueba con dos sesiones.
- [ ] Poner al día los escenarios `estados.detalle` y `estados.libro` de `apps/web/tema/escenarios/registro.mjs`: buscan `.estados-parte` y «formato formal», que ya no se dibujan desde el informe del 2026-11-06, y no abren nada.
