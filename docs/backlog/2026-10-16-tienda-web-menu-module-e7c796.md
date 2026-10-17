## 🌐 «Tienda web» en el lateral: un solo lugar para la tienda online (ADR-0430, 2026-10-16)

**Para hacer:**
- [ ] **Pegar `20261016174000_tienda_web_modulo_resumen.sql` en producción** (idempotente, sin políticas, con prefijo `retail.`). Sin ella
  la web publicada no muestra el Resumen a nadie y el grupo abre en Pedidos; Roles y accesos sigue mostrando los tres módulos en sus
  grupos de antes. Después, refrescar el volcado del diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Dar «Pedidos web» a los roles de cada tienda** en Roles y accesos (decisión de Felipe). Medido en producción el 2026-10-16: solo lo
  tiene «Terminal Almacén»; ninguna caja de tienda lo ve, y un pedido por confirmar se cierra solo a las 24 h.
- [ ] **Dar el Resumen (`tienda_web`)** a quien convenga: nace solo para el líder.
- [ ] **`/chaos` sobre Tienda web** cuando la base local compartida esté al día: las pantallas que guardan (Pedidos, Vitrina, Looks,
  Recomendaciones, Ajustes) no cambiaron qué guardan, pero cambió por dónde se toca (cartas, perchas, camino).
- [ ] **`/formidable` del Resumen** con una colaboradora real: ¿se entiende en 5 segundos «Lo que te pide hoy»?

**Decisiones de Felipe (2026-10-16):**
- [x] ~~¿Resumen propio?~~ — «Sí, con Resumen» (módulo nuevo `tienda_web`).
- [x] ~~¿Hasta dónde llegan las animaciones?~~ — «Ricas, una vez, sin bucle»; un único latido-señal en «Por confirmar» urgente.
