# Ventas sin registrar: la mesa del «Puente» (ADR-0360) — pendientes

- [ ] **La base local tiene datos de demostración de esta pantalla (se resembraron durante `/chaos` y `/formidable`, 2026-10-07).** 7 ventas sin registrar de Tienda
      Lima (1 regularizada por el ataque real de doble clic, 2 movimientos), stock de 5 prendas Blusa y una caja abierta de Lima. `estado.mjs restaurar` falla en esta rama
      (la fila de `clientas` «Boutique Mía SAC» viola `clientas_documento_formato`; la arregla la tarea aparte). Cuando funcione: `node scripts/flujo-de-negocio/estado.mjs
      restaurar chaos-origen --si` (la foto limpia está en `.flujo-de-negocio/estado/`). Otra sesión ya restauró la base una vez a mitad de la corrida.
- [ ] **Falta la pasada con 3–5 colaboradoras reales** (la prueba ciega ya se repitió y pasa) y los ataques de `/chaos` que escriben (concurrencia real, «guardó pero la respuesta no llegó»), cuando el restaurador funcione.
- [ ] Del escéptico, heredados y no tocados: «Reabrir» solo para cerradas (una regularizada no se corrige: mueve stock, decide Felipe), hasta 1 + N elementos rojos con muchas vencidas, «Todas las colaboradoras».
- [ ] **Sin probar con una cola de más de 25 ventas** (el paginado de 25 no cambió, pero la mesa con la página 2 no se miró) **ni con la cuenta de una
      colaboradora de tienda** (la mesa no cambia lo que ve cada rol; la base sigue decidiendo qué puede regularizar).
- [ ] `getDisponiblePorSede` lee `fn_existencias` por tienda sin paginar: PostgREST corta en 1.000 filas. Hoy son 160 filas de stock en toda la red;
      si una tienda pasa de 1.000 prendas con stock, paginar (como `leerTodas`) o filtrar a las variantes que pueden calzar.
- [ ] Las variantes A3 «Arrastrar» y A4 «Perchero» y las maquetas A, B y C quedan en `docs/maquetas/ventas-sin-registrar-2026-10/`: Felipe decide si
      se conservan.
