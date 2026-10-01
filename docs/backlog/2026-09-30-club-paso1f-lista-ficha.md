## 🌸 Club, tanda 1f: la lista y la ficha de /clientas como el spike (2026-09-30, ADR-0288 act. (f)) — rama `claude/club-paso1f-lista-y-ficha`

- [ ] **Pegar en producción** `20260930210000_club_paso1f_lista_y_ficha.sql` DESPUÉS de la 1b (200000 y 200100), sola en el SQL
      Editor; después fusionar la web (lee `preferencias` y llama las funciones nuevas). No está en producción.
- [x] **Junta con la 1b final** (`5e170d2b`, camino B y main): la ficha en el orden del spike (talla → preferencias → permisos →
      historia), el vigilante de `clientas_por_modulo_y_anonimizar` con las funciones de la página y las de la 1f, y «ella misma»
      (`qr_web`) probada en la base.
- [ ] **CL-25 en la caja:** `fn_clienta_compras` todavía cuenta las ventas devueltas enteras; filtrar con
      `retail.fn_venta_devuelta_entera(v.id)` (la 1d la reescribe hoy). Hasta entonces la caja puede decir «frecuente» donde la
      lista y la ficha no.
- [ ] **Felipe:** los valores de Ocasión, Estilo y Evita son de trabajo (CL-5, pendiente 2 de la sección G). ¿El texto `club`
      que se le lee debería nombrar las preferencias (versión 3)?
- [ ] Al unir dos fichas, las preferencias de la que se va no pasan a la que queda (se vuelven a marcar). Decidir si vale la pena.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando esté pegada: `club_etiquetas` y `clientas.preferencias`.
- Cómo verificas: Clientas a 1280, 800 y 375 px (nada se corta, la cabecera en una fila); una socia: «Su sede · N de M»,
  preferencias que se guardan y su historia del permiso (con «ella misma» si confirmó en la página de su QR);
  `pnpm pruebas:club-lista-y-ficha`.
