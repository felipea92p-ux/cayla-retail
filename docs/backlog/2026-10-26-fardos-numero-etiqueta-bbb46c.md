## 📦 Fardos del envío y «Empezar a recibir» (2026-10-26, ADR-0480 «Actualización 2026-10-26 (c)») — migración `20261026214000` solo en local; rama `claude/fardos-numero-etiqueta-bbb46c`

- [x] `fn_envio_detalle` trae `bultos` (reemplazo anclado, idempotente; se detiene si falta la columna `despachos.bultos`). `compras_simple_recibir.mjs` 6/6.
- [x] La hoja «Detalle» y `/recibir/envio/[id]` dicen «Vienen N fardos» (`VienenFardos`); sin dato no dibujan nada. Lector `leerDetalleEnvio` con su prueba.
- [x] «Abrir el fardo» pasa a «Empezar a recibir» en las dos pantallas, el aviso de «envío sin abrir» y las guías `recibir` y `recibir.envio.id` (recorridas con `guias:recorrer`, sin escribir en la base).
- [ ] **Pegar `20261026214000` en producción, con el OK de Felipe**, después de `20261023114000` (la columna) y `20261023121000` (el detalle con papeles). Una sola parte, con `lock_timeout`, sin tablas ni políticas. Hasta entonces la web publicada no muestra fardos y tampoco falla (`bultos` llega vacío).
- [ ] **A propósito sin hacer:** la lista de envíos de Recibir no muestra los fardos (Felipe pidió la hoja «Detalle»); si hace falta, es una columna en `fn_envios_por_abrir`. Tampoco se lleva la cuenta de cuántos fardos ya se abrieron: hoy se cuenta por categoría, no por fardo (ADR-0393).
