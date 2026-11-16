## Cambios: nota de crédito y boleta nueva (ADR-0672, 2026-11-16)

- [ ] **Que el contador confirme** el tratamiento (nota de crédito «06»/«07» + boleta nueva en todo cambio, también el de color o talla), si
      la nota de crédito impresa hay que entregarla a la clienta y qué pasa con una compra que tenía nota de venta (hoy: no emite nada).
- [ ] **Pegar en producción `20261116220000`** (una parte, idempotente; antes, comprobar en solo lectura la huella de `emitir_nota`
      196885b8… y que `registrar_cambio` y `registrar_cambio_varias` siguen siendo las de 7ce86624 y 1847610e). Con el OK de Felipe y del
      contador. Hasta entonces la web nueva tolera la base vieja: sin la columna, Comprobantes no muestra el vínculo y la hoja imprime el
      resumen de siempre.
- [ ] **Primera prueba contra el sandbox de Lucode** de una nota «07» y de una boleta sin venta (ninguna nota parcial se transmitió aún).
- [ ] **Cambio de punta a punta en el navegador** con una base que tenga la migración, y `/chaos`, `/milimetro`, `/formidable` y
      `guias:recorrer` sobre Cambios y Comprobantes: no se corrieron porque la base local compartida es el espejo de `/flujo-de-negocio`
      (solo Felipe la actualiza con `/actualizar-flujo`).
- [ ] **Los 25 cambios ya hechos sin papeles** (S/ 209.70 cobrados, S/ 10.10 devueltos al 2026-11-16, entre ellos B005-000670): si se
      emiten papeles hacia atrás lo decide el contador.
- [ ] **La boleta nueva de un cambio no se puede volver a cambiar** desde el sistema: no es una venta, y Cambios parte de una línea de venta
      (pasaba igual antes, con la prenda que salía de un cambio).
- [ ] **INV-22 mide la diferencia de un cambio por varias a precio de lista** (`cambio_salidas.precio_unitario`) y no ve el descuento del
      mismo modelo (ADR-0655): un cambio por varias con la misma prenda en otra talla podría marcarse sin estar mal. Revisarlo aparte.
- [ ] **«Imprimir lo que se vende en el piso» (estación de impresión)**: la boleta del cambio se imprime en el equipo donde se hace el
      cambio; no se manda a la cola de la caja como una venta del piso.
