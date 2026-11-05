## 🏪 Conf. Tienda: mapa, foto, horario por días y cierres (ADR-0518, 2026-10-26)

**Para hacer (Felipe):**
- [ ] **Pegar `20261026162000_tienda_web_conf_tienda.sql` en producción, en DOS partes y en orden:** (1) todo hasta la línea «PARTE FINAL»; (2) «PARTE FINAL · la política de
  subida de la foto», sola y fuera del horario de tienda (ADR-0195). Sin ella la pantalla nueva abre igual (lo que la base no trae sale vacío), pero guardar el orden, el mapa, la foto, el horario o los cierres falla porque
  la función no existe; y la web vieja sigue funcionando con la base nueva (solo se agregaron claves). Después, refrescar el volcado del diccionario.
- [ ] **Confirmar que la tienda online tiene `TIENDA_FOTOS_ORIGEN`** (la misma de las imágenes de campaña): sin ella, la foto de una tienda no se muestra (queda el dibujo).
- [ ] **Dar `ajustes_web`** en Roles y accesos a quien deba cambiar esto (hoy nace solo para el líder; ya estaba pendiente desde el 2026-10-16).
- [ ] **Correr `/formidable` y `/chaos` sobre Conf. Tienda** (Felipe lo quiso al final, con todo construido). Para `/chaos`: el guardado en varios pasos (WhatsApp → datos → mapa → foto → horario → cierres) si uno falla a la mitad, el doble clic en «Guardar», dos pestañas moviendo el orden a la vez, y subir una foto y cerrar sin guardar (queda un archivo huérfano de 200 KB como máximo).

**Sin verificar (lo dice el ADR-0518):** la subida real de una foto con sesión (se simuló la respuesta del almacén), el mouse real y el dedo en un celular (los gestos se probaron con eventos de puntero), `pnpm guias:recorrer` de la guía nueva.

**Ideas que quedaron fuera a propósito:** un motivo por cierre («Feriado»); cerrar pasada la medianoche (otro modelo del día siguiente); un selector de hora al tocar «10 a. m.».
