## Comprobantes: lo que Lucode ya tenía (2026-10-12, ADR-0378)
- [x] **«Fue emitido anteriormente» se confirma con el XML y se guarda el estado de SUNAT**, o queda como «número ocupado» si es otro documento. Solo web.
- [x] **El aviso «más de 1 hora» cuenta desde la emisión**, no desde el último intento; Comprobantes vacía la cola en varias pasadas al abrirse.
- [ ] **Al fusionar: abrir Comprobantes en producción** y mirar que «Por enviar» baje de 53 a las que de verdad faltan (las 11 `sin_respuesta` se reintentan; si alguna queda como «número ocupado», revisarla con Lucode).
- [ ] **B005-273 vence su plazo de SUNAT el 2026-10-12**: «Enviar ahora» en Por enviar (no depende de este arreglo).
- [ ] **Decidir si el trabajo programado transmite en producción** (`cronNoTransmite`): hoy la cola solo avanza cuando alguien cobra o abre Comprobantes. Es la decisión de «salir en vivo» (PL-113), de Felipe.
- [ ] **`fn_comprobantes_cola_reintento.horas_esperando` sigue midiendo desde el último intento.** La web ya no lo usa para el aviso; si otra pantalla lo lee, que use la fecha de emisión (o una migración que lo cambie).
- [ ] **`/chaos` sobre «Reintentar ahora» y «Reintentar los N»**: los ataques del caso (doble envío, Lucode caído, XML ajeno) los cubren las pruebas de `resolver-ya-emitido.test.ts`; falta la corrida con el catálogo completo.
