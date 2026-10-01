## 🎂 Club, tanda 1c · el 10 % de cumpleaños, un canje por año (ADR-0288 D-5) — rama `claude/club-paso1c-cumpleanos`; migración `20260930230000` + `230100` + `230200` **SIN pegar**

- [ ] **Felipe:** pegar, cada una SOLA y en este orden, después de las dos partes de la 1b:
      `20260930230000_club_paso1c_parte1_venta_items.sql`, `20260930230100_club_paso1c_parte2_configuracion.sql` y
      `20260930230200_club_paso1c_parte3_cumpleanos.sql`. Recién entonces fusionar el PR. La verificación va en el PR.
- [ ] Después de pegar: refrescar el diccionario (`pnpm datos:generar:produccion` con el volcado fresco).
- [ ] Reimprimir desde el Historial (ticket y boleta A4) todavía no distingue la parte del club: muestra solo el descuento
      total de cada prenda.
- [ ] Riesgo conocido y raro: si se corta la red DESPUÉS de que la base guardó una venta con canje, y la asesora quita el
      canje y reintenta con el mismo token, la base devuelve la venta ya guardada (con canje). Documentado en el código.
- [ ] El 10 % se confirma con dos meses de ventas (sección G del acta): se cambia en `configuracion_empresa`, sin deploy.
- Siguiente: 1d («se la probó y no la llevó», sin «es para regalo» por decisión de Felipe) y 1f (lista y ficha).
- Cómo verificas: el recorrido a 375 px del PR; `pnpm pruebas:club-cumpleanos`.
